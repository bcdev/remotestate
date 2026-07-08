# Contributing

Thanks for helping improve Remote State. This repository is split into a Python package, a TypeScript library, 
and a demo app, so the easiest way to contribute is to keep changes focused and run the checks for the part 
you touch.

## Before you start

- Read the README and check existing issues or pull requests to avoid duplicate work.
- Prefer small, reviewable changes.
- If you are changing behavior, add or update tests.
- If you are changing public APIs, update the README or any relevant examples.

## Project layout

- `remotestate-py` contains the Python package and its tests.
- `remotestate-ts` contains the TypeScript library.
- `remotestate-demo` contains the demo application that depends on the TypeScript package.

## Local setup

### Python package

```bash
cd remotestate-py
pixi install
pixi run checks
pixi run tests
```

Useful additional command:

```bash
pixi run format
```

### TypeScript library

```bash
cd remotestate-ts
npm ci
npm run checks
npm run tests
npm run build
```

Useful additional command:

```bash
npm run format
```

### Demo app

```bash
cd remotestate-demo
npm ci
npm run checks
npm run build
```

## What to include in a pull request

- A short summary of the change and why it is needed.
- The commands you ran to verify the change.
- Notes about any follow-up work or known limitations.
- Screenshots or recordings if the change affects the UI.

## Style guidelines

- Follow the existing formatting and linting rules.
- Use descriptive names and keep functions small when practical.
- Match the surrounding style of the file you are editing.
- Avoid mixing unrelated refactors into the same change.

## Review expectations

- Keep discussions technical and respectful.
- Reply to review comments with context when a suggestion is not a fit.
- Update tests or documentation when feedback changes behavior or usage.

