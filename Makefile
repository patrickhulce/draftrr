.PHONY: default ci build lint typecheck test serve dev

default: ci
ci: build lint typecheck test

build:
	pnpm build
lint:
	pnpm lint
typecheck:
	pnpm typecheck
test:
	pnpm test

serve:
	pnpm serve
dev:
	pnpm dev
