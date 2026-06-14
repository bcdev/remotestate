"""Public package exports for building and serving ``remotestate`` apps."""

from importlib.metadata import version

from . import path
from .service import Service, action, query
from .serve import serve
from .store import Store

__version__ = version("remotestate")

__all__ = [
    "Store",
    "Service",
    "action",
    "query",
    "serve",
    "path",
]
