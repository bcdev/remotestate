## Version 0.2.0 (in development)

- Supporting optional remote backend with local state fallback:
  - Added `fallback?: () => RemoteStateClient` to `RemoteStateProvider`.
  - Added `client?: RemoteStateClient` support to `RemoteStateProvider`.
  - `createRemoteStateClient()` now requires an explicit URL.
  - Exported `RemoteStateProviderProps`.
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
