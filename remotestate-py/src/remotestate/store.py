from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar
from html import escape
from typing import Any, Generic, Protocol, TypeVar, cast

from .context import _call_context
from .path import Path, PathInput, PathSegment, normalize_path

type PendingUpdates = dict[Path, Any]
type DefaultFactory = Callable[[Path], Any]

T = TypeVar("T")


class Store(Generic[T]):
    """Reactive Python-side state container addressed by ``remotestate`` paths.

    Values live here as the single source of truth. Actions and queries read
    from it, while actions may also mutate it to trigger UI invalidation.
    """

    def __init__(
        self,
        initial: T,
        *,
        default_factory: DefaultFactory | None = None,
    ) -> None:
        """Create a store.

        Args:
            initial: Initial application state. Any JSON-serializable Python
                value is supported, including mappings, lists, and scalars.
            default_factory: Optional callable used by ``set()`` to
                create missing intermediate path values. It receives the
                missing prefix path as a ``Path`` tuple, such as one
                containing ``"user"`` or ``0`` segments.
                If omitted, missing parents raise the same ``KeyError``,
                ``IndexError``, or ``AttributeError`` as before.
        """
        self._state = initial
        self._default_factory = default_factory
        self._subscribers: list[Callable[[PendingUpdates], None]] = []

    @property
    def state(self) -> T:
        """The current root state value."""
        return self._state

    @property
    def at(self) -> StoreAt:
        """Notebook-friendly path accessor for setting nested values.

        The accessor builds paths through attribute and item access, then writes
        values through ``Store.set()`` when a final attribute or item is
        assigned.
        """
        return _StoreAt(self)

    def __getitem__(self, path: PathInput) -> Any:
        """Return the value at ``path``.

        ``path`` may be a RemoteState path string or a tuple of path segments
        such as ``("items", 0, "label")``. The empty tuple ``()`` addresses
        the root state value.
        """
        return self.get(path)

    def __setitem__(self, path: PathInput, value: Any) -> None:
        """Set ``value`` at ``path``.

        ``path`` follows the same rules as ``__getitem__``.
        """
        self.set(path, value)

    def get(self, path: PathInput = (), *, require: bool = False) -> Any:
        """Return the value at ``path``.

        Missing values return ``None`` by default. Pass ``require=True`` to
        surface the underlying missing-path exception instead. ``get()`` never
        calls the default factory.

        Args:
            path: RemoteState path to read, such as ``""``, ``"user.name"``,
                ``"[0].label"``, or ``("items", 0, "label")``. If omitted,
                the root state value is returned.
            require: If true, raise when the path is missing instead of
                returning ``None``.

        Returns:
            The value at ``path``, or ``None`` when the path is missing and
            ``require`` is false.

        Raises:
            ValueError: If ``path`` is not a valid RemoteState path.
            KeyError: If a required mapping key is missing.
            IndexError: If a required list index is missing.
            AttributeError: If a required object attribute is missing.
        """
        parsed = normalize_path(path)
        return _get_at(self._state, parsed, require)

    def set(self, path: PathInput, value: Any) -> None:
        """Set ``value`` at ``path`` and notify subscribers.

        If this store has a default factory, missing intermediate path
        values are created before assigning the final value. List indexes may
        append exactly one new item at the end; sparse indexes still raise
        ``IndexError``.

        Args:
            path: RemoteState path to write, such as ``""``, ``"user.name"``,
                ``"[0].label"``, or ``("items", 0, "label")``.
            value: New value to assign at ``path``.

        Raises:
            PermissionError: If called while dispatching a query.
            ValueError: If ``path`` is not a valid RemoteState path.
            KeyError: If a required mapping key is missing.
            IndexError: If a required list index is missing or sparse.
            AttributeError: If a required object attribute is missing.
        """
        # Queries are read-only — enforce via call context.
        ctx = _call_context.get()
        if ctx is not None and ctx.readonly:
            raise PermissionError("query methods cannot mutate store")

        norm_path = normalize_path(path)
        self._state = cast(
            T,
            _set_at(
                self._state,
                norm_path,
                value,
                default_factory=self._default_factory,
            ),
        )

        pending = _batch_context.get()
        update_value = _serialize(_get_at(self._state, norm_path, require=False))
        if pending is not None:
            pending[norm_path] = update_value
        else:
            self._notify({norm_path: update_value})

    def subscribe(
        self, callback: Callable[[PendingUpdates], None]
    ) -> Callable[[], None]:
        """Subscribe to batched store updates.

        The callback receives a mapping from changed paths to serialized
        values whenever ``set()`` flushes updates. Returns an unsubscribe
        function that removes the callback.

        Args:
            callback: Function called with a path-to-value mapping after
                updates are flushed.

        Returns:
            A function that unsubscribes ``callback`` from future updates.
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


class StoreAt(Protocol):
    """Path-building proxy protocol as returned by ``Store.at``."""

    @property
    def value(self) -> Any: ...

    def __getattr__(self, name: str) -> StoreAt: ...
    def __setattr__(self, name: str, value: Any) -> None: ...

    def __getitem__(self, segment: PathSegment) -> StoreAt: ...
    def __setitem__(self, segment: PathSegment, value: Any) -> None: ...

    def __str__(self) -> str: ...
    def __repr__(self) -> str: ...


class _StoreAt(StoreAt):
    """Path-building proxy implementation returned by ``Store.at``."""

    _path: Path
    _store: Store[Any]

    # Only these names are real attributes; all other attributes are path segments.
    # It prevents silently and accidentally created attributes.
    __slots__ = ("_path", "_store")

    def __init__(self, store: Store[Any], path: Path = ()) -> None:
        object.__setattr__(self, "_store", store)
        object.__setattr__(self, "_path", path)

    @property
    def value(self) -> Any:
        return self._store.get(self._path)

    def __getattr__(self, name: str) -> _StoreAt:
        if name.startswith("_"):
            raise AttributeError(name)
        return _StoreAt(self._store, (*self._path, name))

    def __setattr__(self, name: str, value: Any) -> None:
        if name.startswith("_"):
            raise AttributeError(name)
        self._store.set((*self._path, name), value)

    def __getitem__(self, segment: PathSegment) -> _StoreAt:
        return _StoreAt(self._store, (*self._path, segment))

    def __setitem__(self, segment: PathSegment, value: Any) -> None:
        self._store.set((*self._path, segment), value)

    def __str__(self) -> str:
        return str(self.value)

    def __repr__(self) -> str:
        return repr(self.value)

    def _repr_html_(self) -> str:
        return f"<pre>{escape(repr(self.value))}</pre>"

    def _repr_pretty_(self, printer: Any, cycle: bool) -> None:
        if cycle:
            printer.text("...")
        else:
            printer.pretty(self.value)


def _set_or_append_segment(
    obj: Any, segment: PathSegment, value: Any, *, require_appendable: bool
) -> None:
    if isinstance(segment, int) and isinstance(obj, list) and segment == len(obj):
        obj.append(value)
        return
    if require_appendable:
        if isinstance(segment, int):
            raise IndexError(segment)
        raise KeyError(segment)
    _set_segment(obj, segment, value)


def _get_segment(obj: Any, segment: PathSegment, require: bool) -> Any:
    if isinstance(segment, str):
        if isinstance(obj, dict):
            if require:
                return obj[segment]
            return obj.get(segment)
        if require:
            return getattr(obj, segment)
        return getattr(obj, segment, None)
    try:
        return obj[segment]
    except (IndexError, KeyError, TypeError):
        if require:
            raise
        return None


def _set_segment(obj: Any, segment: PathSegment, value: Any) -> None:
    if isinstance(segment, str):
        if isinstance(obj, dict):
            obj[segment] = value
        else:
            setattr(obj, segment, value)
        return
    obj[segment] = value


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
) -> Any:
    if len(path) == 0:
        return value

    obj = root
    for i, segment in enumerate(path[:-1], start=1):
        try:
            obj = _get_segment(obj, segment, require=True)
        except (AttributeError, IndexError, KeyError):
            if default_factory is None:
                raise
            if (
                isinstance(segment, int)
                and isinstance(obj, list)
                and segment > len(obj)
            ):
                raise
            default_value = default_factory(path[:i])
            _set_or_append_segment(
                obj,
                segment,
                default_value,
                require_appendable=isinstance(segment, int),
            )
            obj = default_value

    try:
        _set_segment(obj, path[-1], value)
    except IndexError:
        if default_factory is None:
            raise
        _set_or_append_segment(obj, path[-1], value, require_appendable=True)
    return root


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
