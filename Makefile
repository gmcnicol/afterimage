SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help bootstrap install dev run studio live appliance build test lint typecheck check dist-studio dist-studio-dir dist-studio-mac

help: ## Show available commands.
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Install first-run tooling and tidy the Go module.
	bash scripts/bootstrap.sh

install: ## Install workspace dependencies from the lockfile.
	pnpm install

dev: ## Run all workspace dev tasks in parallel.
	pnpm dev

run: studio ## Run the default desktop app.

studio: ## Run Afterimage Studio Desktop.
	pnpm dev:studio

live: ## Run Afterimage Live Desktop.
	pnpm dev:live

appliance: ## Run the Live Appliance Go service locally.
	pnpm dev:appliance

build: ## Build all workspace packages and apps.
	pnpm build

test: ## Run all workspace tests.
	pnpm test

lint: ## Run all workspace lint tasks.
	pnpm lint

typecheck: ## Run TypeScript type checks.
	pnpm typecheck

check: lint typecheck test ## Run lint, typecheck, and tests.

dist-studio: ## Build packaged Studio Desktop artifacts.
	pnpm --dir apps/studio-desktop dist

dist-studio-dir: ## Build unpacked Studio Desktop distribution output.
	pnpm --dir apps/studio-desktop dist:dir

dist-studio-mac: ## Build Studio Desktop macOS zip and dmg artifacts.
	pnpm --dir apps/studio-desktop dist:mac
