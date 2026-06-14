# remotestate/store.py
from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar
from typing import Any

from .context import _call_context
from .path import (
    Index,
    Path,
    PathSegment,
    Property,
    parse_path,
    path_to_str,
    prefixes,
)

type PendingUpdates = dict[str, Any]
type DefaultFactory = Callable[[Path], Any]


class Store:
    """Reactive Python-side state container addressed by ``remotestate`` paths.

    Values live here as the single source of truth. Actions and queries read
    from it, while actions may also mutate it to trigger UI invalidation.
    """

    def __init__(
        self,
        initial: dict[str, Any],
        *,
        default_factory: DefaultFactory | None = None,
    ) -> None:
        """Create a store.

        Args:
            initial: Initial application state.
            default_factory: Optional callable used by ``set()`` to
                create missing intermediate path values. It receives the
                missing prefix path as a ``Path`` tuple, such as one
                containing ``Property("user")`` or ``Index(0)`` segments.
                If omitted, missing parents raise the same ``KeyError``,
                ``IndexError``, or ``AttributeError`` as before.
        """
        self._state = initial
        self._default_factory = default_factory
        self._subscribers: list[Callable[[PendingUpdates], None]] = []

    def get(self, path: str, *, require: bool = False) -> Any:
        """Return the value at ``path``.

        Missing values return ``None`` by default. Pass ``require=True`` to
        surface the underlying missing-path exception instead. ``get()`` never
        calls the default factory.
        """
        parsed = parse_path(path)
        return _get_at(self._state, parsed, require)

    def set(self, path: str, value: Any) -> None:
        """Set ``value`` at ``path`` and notify subscribers.

        If this store has a default factory, missing intermediate path
        values are created before assigning the final value. List indexes may
        append exactly one new item at the end; sparse indexes still raise
        ``IndexError``.
        """
        # Queries are read-only — enforce via call context.
        ctx = _call_context.get()
        if ctx is not None and ctx.readonly:
            raise PermissionError("query methods cannot mutate store")

        parsed = parse_path(path)
        _set_at(
            self._state,
            parsed,
            value,
            default_factory=self._default_factory,
        )

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
        """Subscribe to batched store updates.

        The callback receives a mapping from changed prefix paths to serialized
        values whenever ``set()`` flushes updates. Returns an unsubscribe
        function that removes the callback.
        """
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


def _set_or_append_segment(
    obj: Any, segment: PathSegment, value: Any, *, require_appendable: bool
) -> None:
    if isinstance(segment, Index) and isinstance(obj, list) and segment.i == len(obj):
        obj.append(value)
        return
    if require_appendable:
        if isinstance(segment, Index):
            raise IndexError(segment.i)
        else:
            raise KeyError(segment.key)
    _set_segment(obj, segment, value)


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


def _set_at(
    root: Any,
    path: Path,
    value: Any,
    default_factory: DefaultFactory | None = None,
) -> None:
    obj = root
    for i, segment in enumerate(path[:-1], start=1):
        try:
            obj = _get_segment(obj, segment, require=True)
        except (AttributeError, IndexError, KeyError):
            if default_factory is None:
                raise
            if (
                isinstance(segment, Index)
                and isinstance(obj, list)
                and segment.i > len(obj)
            ):
                raise
            default_value = default_factory(path[:i])
            _set_or_append_segment(
                obj,
                segment,
                default_value,
                require_appendable=isinstance(segment, Index),
            )
            obj = default_value

    try:
        _set_segment(obj, path[-1], value)
    except IndexError:
        if default_factory is None:
            raise
        _set_or_append_segment(obj, path[-1], value, require_appendable=True)


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
