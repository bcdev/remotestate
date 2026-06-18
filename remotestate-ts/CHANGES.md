## Version 0.2.0 (in development)

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
  - `Store.subscribe()` now takes a required path first:
    `subscribe(path, listener)`.
- Refactorings:
  - Renamed `RemoteState` to `RemoteStateClient`.
  - Renamed `RemoteStateOptions` to `RemoteStateClientOptions`.
  - Renamed `createRemoteState` to `createRemoteStateClient`.
  - Renamed `useRemoteState` to `useRemoteStateClient`.

## Version 0.1.0

Initial release from 2026-06-09.
