## Tech stack

### Framework & Runtime

- **Runtime:** Node.js
- **Language:** TypeScript
- **Package Manager:** npm

### Database & Storage

- **Database:** PostgreSQL
- **ORM:** Drizzle

### Testing & Quality

- **Test Framework:** Vitest
- **Linting:** ESLint (default config)
- **Formatting:** Prettier (default config)
- **Path Aliases:** Use `@/*` for src imports (e.g., `@/utils/file.ts`), enforced via eslint-plugin-import

### Validation

- **Schema Validation:** Zod

### Deployment & Infrastructure

- **CI/CD:** GitHub Actions
- **Containerization:** Docker
- **Container Registry:** GitHub Container Registry (ghcr.io)
