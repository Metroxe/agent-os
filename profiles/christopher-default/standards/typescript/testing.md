## Typescript Testing best practices

- **Mocking in Test Suite**: Mocking can often be quite difficult and overly complicated, if its not super simple to mock, don't do it, and just the real implementation. If its a database, we should mock those, but likely with testcontainers.
- **Third Party Testing**: If there is no cost, rate limit, or risk to production, test directly on the third party.
- **Test file location**: Put e2e or multi-file tests in a `tests` folder outside of `src`. Put unit tests for a single file next to it as `{filename}.spec.ts`.
