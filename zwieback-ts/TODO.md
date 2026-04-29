# zwieback-ts To-Dos

## Refactorings

- [x] Drop _snapshot_ in method names. Document snapshot behavior.
- [x] Remove `TaskStoreImpl.allSnapshot` as sorting should be done by hook clients.
- [x] Rename `id` to `callId` (`call_id` in protocol)
- [x] Rename `tid` to `taskId` (`tasK_id` in protocol)
- [ ] Rename and/or move `Store._fetchIfNeeded`, 
      it should not appear in interface
- [ ] Remove `ìndex.html` and `src/dev`, create new vite/react 
      project `zwieback-demo` instead

## Potential problems

- [ ] `TaskController.finishTask()` currently relies on an
      `"invalidate"` message being sent from a terminating
      action. If we soon only invalidate if the state actually
      changes, then we cannot finish action tasks at all.

## Improve client configuration

- [ ] `url` passed to `createClient` must have format 
       `ws://${server_base_url_without_scheme}/ws`, 
       Better if the WS-URL could be derived: e.g.,
       Let user pass server base HTTP-URL 
       and let `createClient` create WE-URL.
