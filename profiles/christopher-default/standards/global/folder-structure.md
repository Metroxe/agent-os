## Folder structure best practices

- **entrypoints/**: All possible starting points for the application. Each file is a thin "starter" that imports from `lib/` and `services/`, wires things together, and kicks off the application. A project may have multiple entrypoints (cli.ts, server.ts, worker.ts, index.ts for library exports). Works well with bundlers like tsup that can compile each entrypoint separately.
- **services/**: Third-party integrations and infrastructure setup—database clients (Postgres, Redis), payment providers (Stripe), email services, external API clients.
- **lib/**: Core business logic organized as internal libraries (e.g., `lib/users/`, `lib/billing/`, `lib/auth/`). Start flat within each subfolder; add subfolders when complexity demands it.
- **utils/**: Pure utility functions with no domain knowledge—formatters, validators, helpers.
- **types/ (optional)**: Shared type definitions, if not colocated with their relevant modules.
