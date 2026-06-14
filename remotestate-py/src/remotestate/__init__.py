"""Public package exports for building and serving ``remotestate`` apps."""

from importlib.metadata import version

from .path import Index, Path, PathSegment, Property
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
    "Index",
    "Path",
    "PathSegment",
    "Property",
]
