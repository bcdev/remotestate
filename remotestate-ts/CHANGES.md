## Version 0.3.0

- Relaxed the shared path grammar so the empty string addresses the root value
  and paths may start with a bracketed array index or string key, such as
  `[0].label` or `["display name"].value`.
- Changed `Path` from a non-empty tuple type to a general segment array so
  `[]` represents the root state value.
- Removed the redundant `RelativePath` export; `Path` is now the single parsed
  segment-array type.
- `Store.get()` and `useRemoteStateValue()` now default to the root state value
  when no path is passed.
- `Store.set()` now uses a dedicated store `set` protocol message and receives
  `set_result` updates instead of dispatching a service action named `set`.
- The WebSocket protocol now carries normalized path arrays instead of path
  strings. Store update results now use `[{path, value}]` entries instead of
  path-to-value objects.
- Updated the transport-backed store cache so root subscriptions overlap all
  descendant updates, root updates materialize cached descendants, and leaf
  updates can patch cached root snapshots.
- Renamed the public path input alias from `PathLike` to `PathInput`, and added
  `PathSegmentInput` for raw segment values.

## Version 0.2.0

- Tightened the shared path grammar to a strict JSONPath subset without the
  `$.` prefix:
  - Root paths must start with an identifier.
  - Later segments may use dotted identifiers, bracketed integer indices, or
    bracketed string keys.
  - Bracketed string keys may use either single or double quotes; formatting
    stays canonical with double quotes.
  - Invalid paths now fail explicitly instead of silently returning a parsed
    prefix.
- Added `normalizePath()` as the public path validator/normalizer.
- Updated parser docstrings, README examples, and path tests to match the
  shared grammar.
- Supporting optional remote backend with local state fallback:
  - Added `fallback?: () => RemoteStateClient` to `RemoteStateProvider`.
  - Added `client?: RemoteStateClient` support to `RemoteStateProvider`.
  - Removed `active?: boolean` from `RemoteStateProvider`.
  - Removed `useOptionalRemoteStateClient<S>()`; hooks now always require a
    provider with either `url`, `client`, or `fallback`.
  - `createRemoteStateClient()` now requires an explicit URL.
  - Added `createLocalStateClient()` to wrap local stores and
    action/query handlers as fallback clients.
  - Updated docs with:
    - a basic counter RemoteState usage example
    - an optional remote backend/local client fallback example
    - root README references to `RemoteStateProvider`
- Slimmed store update handling:
  - The client now accepts exact changed paths from `action_result` updates
    instead of requiring redundant parent-prefix payloads.
  - Cached parent and child snapshots are reconciled locally when related
    paths update.
  - Subscribed parent and child snapshots are now materialized from related
    exact-path updates so `useRemoteStateValue()` rerenders for subpath
    changes.
  - `Store.subscribe()` now takes a required path first:
    `subscribe(path, listener)`.
- Improved TypeScript package build output:
  - Split library, Node/Vite config, and ESLint TypeScript projects.
  - Clean `dist` before rebuilding to prevent stale artifacts.
  - Keep API docs in the bundled `.d.ts` file while stripping JSDoc blocks
    from the bundled runtime JavaScript.
  - Ensure the library bundle externalizes React peer dependencies and avoids
    publishing test/dev-only artifacts.
- Refactorings:
  - Renamed `RemoteState` to `RemoteStateClient`.
  - Renamed `RemoteStateOptions` to `RemoteStateClientOptions`.
  - Renamed `createRemoteState` to `createRemoteStateClient`.
  - Renamed `useRemoteState` to `useRemoteStateClient`.

## Version 0.1.0

Initial release from 2026-06-09.
