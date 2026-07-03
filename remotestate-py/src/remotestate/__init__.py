"""Public package exports for building and serving ``remotestate`` apps."""

from importlib.metadata import version

from . import path
from .serve import ServeResult, serve
from .service import Service, action, query
from .store import Store, StoreAt

__version__ = version("remotestate")

__all__ = [
    "Store",
    "StoreAt",
    "Service",
    "ServeResult",
    "action",
    "query",
    "serve",
    "path",
]
