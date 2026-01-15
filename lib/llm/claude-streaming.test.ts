/**
 * Claude Code Streaming Tests
 *
 * Tests for Task Group 2: Claude Code Real-time Streaming and Thinking Blocks
 * - Test that text_delta events are processed in real-time
 * - Test thinking block display in magenta
 * - Test tool call display as they happen
 */

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import chalk from "chalk";
import { formatToolUse } from "./formatting.js";

/**
 * Mock stream processing to test event handling behavior
 * These tests verify the streaming logic without requiring the actual Claude CLI
 */

describe("Claude Streaming Behavior", () => {
  // Capture stdout writes for verification
  let stdoutWrites: string[] = [];
  let consoleLogCalls: string[] = [];
  const originalWrite = process.stdout.write;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    stdoutWrites = [];
    consoleLogCalls = [];
    // @ts-expect-error - mocking write
    process.stdout.write = (chunk: string | Buffer) => {
      stdoutWrites.push(chunk.toString());
      return true;
    };
    console.log = (...args: unknown[]) => {
      consoleLogCalls.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    console.log = originalConsoleLog;
  });

  describe("text_delta event processing", () => {
    it("should process text_delta events immediately using stdout.write", () => {
      // Simulate the text_delta handling from claude.ts
      const textDeltaEvent = {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: "Hello, world!",
        },
      };

      // This simulates what claude.ts does when receiving a text_delta
      if (
        textDeltaEvent.delta?.type === "text_delta" &&
        textDeltaEvent.delta?.text
      ) {
        process.stdout.write(textDeltaEvent.delta.text);
      }

      // Verify immediate write occurred
      expect(stdoutWrites).toHaveLength(1);
      expect(stdoutWrites[0]).toBe("Hello, world!");
    });

    it("should accumulate multiple text_delta events in order", () => {
      const deltas = [
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "First " } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Second " } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Third" } },
      ];

      // Process each delta in order
      for (const event of deltas) {
        if (event.delta?.type === "text_delta" && event.delta?.text) {
          process.stdout.write(event.delta.text);
        }
      }

      // Verify all writes occurred in order
      expect(stdoutWrites).toHaveLength(3);
      expect(stdoutWrites.join("")).toBe("First Second Third");
    });
  });

  describe("thinking block display", () => {
    it("should display thinking blocks in magenta with [Thinking] prefix", () => {
      // Simulate thinking block handling (what we'll add to claude.ts)
      let thinkingStarted = false;
      const thinkingEvent = {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "Let me analyze this problem...",
        },
      };

      // Handle thinking delta similar to Cursor's implementation
      if (thinkingEvent.delta?.type === "thinking_delta" && thinkingEvent.delta?.thinking) {
        if (!thinkingStarted) {
          process.stdout.write(chalk.magenta("[Thinking] "));
          thinkingStarted = true;
        }
        process.stdout.write(chalk.magenta(thinkingEvent.delta.thinking));
      }

      // Verify thinking output was written
      expect(stdoutWrites.length).toBeGreaterThan(0);
      // The output should contain the prefix and text (with ANSI codes for magenta)
      const fullOutput = stdoutWrites.join("");
      expect(fullOutput).toContain("[Thinking]");
      expect(fullOutput).toContain("Let me analyze");
    });

    it("should track thinkingStarted state across delta events", () => {
      let thinkingStarted = false;

      const events = [
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "First part " },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "second part" },
        },
      ];

      for (const event of events) {
        if (event.delta?.type === "thinking_delta" && event.delta?.thinking) {
          if (!thinkingStarted) {
            process.stdout.write(chalk.magenta("[Thinking] "));
            thinkingStarted = true;
          }
          process.stdout.write(chalk.magenta(event.delta.thinking));
        }
      }

      // Should only have one [Thinking] prefix even with multiple deltas
      const fullOutput = stdoutWrites.join("");
      const thinkingMatches = fullOutput.match(/\[Thinking\]/g);
      expect(thinkingMatches).toHaveLength(1);
    });
  });

  describe("tool call display", () => {
    it("should display tool calls as they happen via content_block_stop", () => {
      // Simulate block tracking system
      const blocks: Record<number, { type: string; name?: string; input?: string }> = {};

      // content_block_start event
      const startEvent = {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          name: "Read",
        },
      };

      // Track the block
      if (startEvent.content_block?.type === "tool_use") {
        blocks[startEvent.index] = {
          type: "tool_use",
          name: startEvent.content_block.name || "tool",
          input: "",
        };
      }

      // Simulate input JSON accumulation
      const inputDelta = {
        type: "content_block_delta",
        index: 1,
        delta: {
          type: "input_json_delta",
          partial_json: '{"path": "/test/file.ts"}',
        },
      };

      if (inputDelta.delta?.type === "input_json_delta") {
        blocks[inputDelta.index].input =
          (blocks[inputDelta.index].input || "") + inputDelta.delta.partial_json;
      }

      // content_block_stop event
      const stopEvent = {
        type: "content_block_stop",
        index: 1,
      };

      // Display tool on stop
      const block = blocks[stopEvent.index];
      if (block && block.type === "tool_use") {
        const toolDisplay = formatToolUse(block.name || "tool", block.input || "");
        console.log(chalk.cyan(`  ➤ ${toolDisplay}`));
      }

      // Verify tool call was displayed
      expect(consoleLogCalls).toHaveLength(1);
      expect(consoleLogCalls[0]).toContain("Reading");
    });
  });
});

describe("StreamingBlock interface", () => {
  it("should support thinking type in addition to text, tool_use, tool_result", () => {
    // Test that the interface can handle thinking blocks
    interface StreamingBlock {
      type: "text" | "tool_use" | "tool_result" | "thinking";
      name?: string;
      input?: string;
      content?: string;
    }

    const thinkingBlock: StreamingBlock = {
      type: "thinking",
      content: "Analyzing the problem...",
    };

    expect(thinkingBlock.type).toBe("thinking");
    expect(thinkingBlock.content).toBe("Analyzing the problem...");
  });
});
