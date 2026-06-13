# RemoteState - TypeScript/React

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)

[![npm version](https://img.shields.io/npm/v/remotestate?logo=npm)](https://www.npmjs.com/package/remotestate)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`remotestate` is the TypeScript and React bridge of the _RemoteState_ library.

This package provides the frontend client, provider, and hooks that pair with
the Python backend from the main repository.

## Install

```bash
npm install remotestate
```

## Use

```ts
import { RemoteStateClientProvider, useRemoteState } from "remotestate";
```

For full project documentation, see the repository root README:
[Remote State](https://github.com/bcdev/remotestate)
