# remotestate-ts To-Dos

## New Features

- [ ] Ease implementing the `RemoteStateClient` interface in general.
      See example in `README.md`, which is quite complex.
- [ ] Ease implementing the `RemoteStateClient` interface for zustand-users.
      Create a new subpackage `zustand` for this and make zustand a peer dependency.
- [ ] Make `react` a truly optional submodule.
      No longer export it from maon module.
- [x] Require an explicit WebSocket URL or local fallback client.
- [x] Retry connecting to `WebSocket`, if connection could not be
      established yet, or it was lost.
- [ ] Show a connection component "Connecting. Retrying in X seconds...".

## Refactorings

- [x] Where applicable rename `RemoteState` to `RemoteStateClient`,
      in interface and function names.
- [x] Drop _snapshot_ in method names. Document snapshot behavior instead.
- [x] Remove `TaskStoreImpl.allSnapshot` as sorting should be done by hook clients.
- [x] Rename `id` to `callId` (`call_id` in protocol)
- [x] Rename `tid` to `taskId` (`tasK_id` in protocol)
- [x] Rename `InvalidateMessage` to `ActionResultMessage`
- [x] Rename `"invalidate"` message to `"action_result"`
- [x] Rename `"task_update"` message to `"update_task"`
- [x] Rename `Store._fetchIfNeeded` to `Store._provide`
- [x] Remove `ìndex.html` and `src/dev`, create new vite/react
      project `remotestate-demo` instead

## Potential problems

- [ ] `TaskController.finishTask()` currently relies on an
      `"invalidate"` message being sent from a terminating
      action. If we soon only invalidate if the state actually
      changes, then we cannot finish action tasks at all.

## Improve client configuration

- [x] `url` passed to `createRemoteStateClient` may be a WebSocket endpoint or server
      base HTTP-URL. `createRemoteStateClient` derives the WebSocket URL when needed.
