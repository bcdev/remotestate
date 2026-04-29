# zwieback-py To-Dos

## Refactorings

- [x] Rename protocol `id` to `call_id`
- [x] Rename protocol `tid` to `task_id`
- [x] Rename `InvalidateMessage` to `ActionResultMessage`
- [x] Rename `"invalidate"` message to `"action_result"`  
- [ ] Rename `Service.process` to something better

## Improve error handling 

- [ ] Review Server and Service classes
- [ ] Visit all critical paths: log or raise or both?
- [ ] Include traceback in `ErrorMessage`

## State equality

- [ ] Only include values in TaskUpdateMessage that changed. Use `==` by default. 
      Ensure `InvalidatetMessage` is always sent, even if there are no updates.
- [ ] Allow passing custom equality checks, register `f(a, b): bool` 
      using state path as key.

## State serialization

- [ ] Register JSON codec or Pydantic class using state path as key

## State validation

- [ ] Register OpenAPI/JSON schema or Pydantic class using state path as key.
- [ ] Use schema validate before setting a value 

## Performance

- [ ] Check code for obvious optimization options
- [ ] Check code for potential performance limitation issues
- [ ] Check if we can compress request/response sizes, e.g., 
      have a special binary format for (numpy-like) array data 
      and (pandas-like) data frames.  
- [ ] Maybe throttle number emitted TaskUpdateMessage / time
- [ ] Was using WebSockets + JSON the right decision?

## CI

- [ ] Enhance quality checks, e.g., use mypy or similar
- [ ] Configure GitHub actions

# zwieback-py Ideas

## Add-on project: UI generation

- [ ] Allow for UI generation from OpenAPI/JSON schema. 
      FieldFactory interface: Neutral w.r.t. UI lib
