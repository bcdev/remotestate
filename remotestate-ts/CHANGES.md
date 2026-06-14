## Version 0.1.1 (in development)

- Supporting optional remote backend with local state fallback:
  - Added `active?: boolean` to `RemoteStateProvider`.
  - Added `client?: RemoteStateClient | null` support to `RemoteStateProvider`.
  - Added `useOptionalRemoteStateClient<S>()`, which returns `null` when no 
    active client is available.
  - Kept `useRemoteStateClient<S>()` strict, now throwing when used outside an active provider.
  - Exported `useOptionalRemoteStateClient` and `RemoteStateProviderProps`.
  - Updated docs with:
    - a basic counter RemoteState usage example
    - an optional remote backend/local state fallback example
    - root README references to `RemoteStateProvider`
- Refactorings:
  - Renamed `RemoteState` to `RemoteStateClient`.
  - Renamed `RemoteStateOptions` to `RemoteStateClientOptions`.
  - Renamed `createRemoteState` to `createRemoteStateClient`.
  - Renamed `useRemoteState` to `useRemoteStateClient`.

## Version 0.1.0

Initial release from 2026-06-09.
