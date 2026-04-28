# zwieback/store.py
from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar
from typing import Any

from zwieback.context import _call_context
from zwieback.path import (
    Index,
    Path,
    PathSegment,
    Property,
    parse_path,
    path_to_str,
    prefixes,
)

type PendingUpdates = dict[str, Any]


def _get_segment(obj: Any, segment: PathSegment, require: bool) -> Any:
    match segment:
        case Property(key):
            if isinstance(obj, dict):
                if require:
                    return obj[key]
                return obj.get(key)
            else:
                if require:
                    return getattr(obj, key)
                return getattr(obj, key, None)
        case Index(i):
            try:
                return obj[i]
            except IndexError:
                if require:
                    raise
                return None


def _set_segment(obj: Any, segment: PathSegment, value: Any) -> None:
    match segment:
        case Property(key):
            if isinstance(obj, dict):
                obj[key] = value
            else:
                setattr(obj, key, value)
        case Index(i):
            obj[i] = value


def _get_at(root: Any, path: Path, require: bool) -> Any:
    obj = root
    for segment in path:
        obj = _get_segment(obj, segment, require)
        if obj is None and not require:
            return None
    return obj


def _set_at(root: Any, path: Path, value: Any) -> None:
    obj = root
    for segment in path[:-1]:
        obj = _get_segment(obj, segment, require=True)
    _set_segment(obj, path[-1], value)


def _serialize(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "__dataclass_fields__"):
        from dataclasses import asdict

        return asdict(value)
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    return value


class _batch_pending_updates:
    def __enter__(self) -> PendingUpdates:
        self._pending: PendingUpdates = {}
        self._token = _batch_context.set(self._pending)
        return self._pending

    def __exit__(self, *_: Any) -> None:
        _batch_context.reset(self._token)


_batch_context: ContextVar[PendingUpdates | None] = ContextVar(
    "_batch_context", default=None
)


class Store:
    """Reactive Python-side state container addressed by zwieback paths.

    Values live here as the single source of truth. Actions and queries read
    from it, while actions may also mutate it to trigger UI invalidation.
    """

    def __init__(self, initial: dict[str, Any]) -> None:
        self._state = initial
        self._subscribers: list[Callable[[PendingUpdates], None]] = []

    def get(self, path: str, *, require: bool = False) -> Any:
        parsed = parse_path(path)
        return _get_at(self._state, parsed, require)

    def set(self, path: str, value: Any) -> None:
        # Queries are read-only — enforce via call context.
        ctx = _call_context.get()
        if ctx is not None and ctx.readonly:
            raise PermissionError("query methods cannot mutate store")

        parsed = parse_path(path)
        _set_at(self._state, parsed, value)

        pending = _batch_context.get()
        if pending is not None:
            for prefix in prefixes(parsed):
                prefix_str = path_to_str(prefix)
                pending[prefix_str] = _serialize(
                    _get_at(self._state, prefix, require=False)
                )
        else:
            updates = {
                path_to_str(prefix): _serialize(
                    _get_at(self._state, prefix, require=False)
                )
                for prefix in prefixes(parsed)
            }
            self._notify(updates)

    def subscribe(
        self, callback: Callable[[PendingUpdates], None]
    ) -> Callable[[], None]:
        self._subscribers.append(callback)

        def unsubscribe() -> None:
            self._subscribers.remove(callback)

        return unsubscribe

    def _notify(self, updates: PendingUpdates) -> None:
        for cb in self._subscribers:
            cb(updates)

    def _flush(self, pending: PendingUpdates) -> None:
        if pending:
            self._notify(pending)
