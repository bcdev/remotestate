# RemoteState - Python

`remotestate` is the Python runtime for the _RemoteState_ library.

It gives you:

- `Store` for application state
- `Service` for defining actions and queries
- `action` and `query` decorators
- `serve()` for exposing the backend to the React frontend

## Install

```bash
pip install remotestate
```

## Quick Start

```python
import remotestate as rs

store = rs.Store({"count": 0})


class MyService(rs.Service):
    @rs.action
    async def increment(self):
        self.store.set("count", self.store.get("count") + 1)


rs.serve(MyService(store), dist_dir="my-ui/dist")
```

For the full project overview, see the repository root README:
[Remote State](https://github.com/bcdev/remotestate)
