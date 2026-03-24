<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Project Setup

- I should be able to run everything locally (Docker is okay), so make sure to add relevant services to docker compose when they're required
- Always update my .env.local file with the necessary environment variables when they're required

## Documentation

- After every change, update the README to include the following:
  - Quickstart: how to run, test, etc
  - Project structure: a diagram of the current project structure
  - API: the current API surface (with any relevant information to help users make requests to our API with CURL, etc)
  - Data models: what do our data models look like?

## Validations

- Create npm scripts and GitHub actions to do the following:
  - format with `prettier`
  - lint with `eslint`
  - type check
  - run tests with `jest`

## Commits and PRs

- Always branch off of main, if pre-requisites for current branch aren't met, ask me what to do
- Always perform linting, formatting, type check, and tests (if these scripts exist) before committing (we should never find these errors in CI)

## Plans

- Plans should break down work into single-functionality, easily reviewable PRs
- Plans should be stored in the [plans](./plans/) directory

## Prompting

- Write every prompt I give, verbatim, to plans/prompts.md (create if necessary)
