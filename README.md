# draftrr

Local-first fantasy football draft assistant. Rank players into tiers, run a live board with availability projections, and optionally mirror a Sleeper draft through a Chrome extension.

## Apps

- `apps/web` — Next.js static UI (`/players`, `/rank`, `/draft`, `/history`)
- `apps/extension` — MV3 companion that publishes the active Sleeper draft id
- `packages/core` — CSV import, name matching, draft engine, Sleeper client

## Commands

```bash
pnpm install
make          # ci: build, lint, typecheck, test
make serve    # Next.js dev server on :3000
```

Load the unpacked extension from `apps/extension/dist/chrome-mv3` after `pnpm --filter @draftrr/extension build`.

## Data

Player projections live in [`data/players.csv`](data/players.csv). Nickname aliases live in [`data/aliases.csv`](data/aliases.csv). Rebuild generated modules with `pnpm --filter @draftrr/core build:data`.
