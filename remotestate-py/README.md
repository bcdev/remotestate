# RemoteState - Python

[![CI](https://github.com/bcdev/remotestate/actions/workflows/ci.yml/badge.svg)](https://github.com/bcdev/remotestate/actions/workflows/ci.yml)

[![PyPI version](https://img.shields.io/pypi/v/remotestate?logo=pypi)](https://pypi.org/project/remotestate/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![pydantic](https://img.shields.io/badge/pydantic-E92063?logo=pydantic&logoColor=white)](https://docs.pydantic.dev/)
[![Ruff](https://img.shields.io/badge/Ruff-2C2F3A?logo=ruff&logoColor=white)](https://docs.astral.sh/ruff/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


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
