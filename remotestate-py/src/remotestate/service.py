from __future__ import annotations

import asyncio
import functools
import inspect
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import FastAPI

from .context import _call_context, _CallContext
from .protocol import TaskUpdateMessage
from .store import PendingUpdates, Store, _batch_pending_updates


class _ActionMarker:
    """Marker object used while collecting ``@action`` methods."""

    def __init__(self, fn: Callable) -> None:
        self.fn = fn


class _QueryMarker:
    """Marker object used while collecting ``@query`` methods."""

    def __init__(self, fn: Callable) -> None:
        self.fn = fn


def _ensure_async(fn: Callable) -> Callable:
    """Wrap a sync function so the service runtime can await it."""

    if inspect.iscoroutinefunction(fn):
        return fn

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        return fn(*args, **kwargs)

    return wrapper


def action(fn: Callable) -> _ActionMarker:
    """Declare a service method as a state-mutating action.

    Args:
        fn: The method to expose to the JavaScript client.

    Returns:
        A marker consumed by ``Service.__init_subclass__``.
    """

    return _ActionMarker(_ensure_async(fn))


def query(fn: Callable) -> _QueryMarker:
    """Declare a service method as a read-only query.

    Args:
        fn: The method to expose to the JavaScript client.

    Returns:
        A marker consumed by ``Service.__init_subclass__``.
    """

    return _QueryMarker(_ensure_async(fn))


_BUILTIN_SERVICE_METHODS = {"get", "set", "notify"}


class Service:
    """Implements the Python queries and actions exposed over the websocket bridge.

    Subclasses define ``@action`` and ``@query`` methods. Dispatch helpers take
    care of call scoping, read-only enforcement for queries, and batched store
    invalidation after actions complete.

    The base class also provides the built-in ``get`` query and ``set``
    action used by the generic React bridge.

    ``Service`` may serve as a base class for store-specific queries and actions,
    but it can also be instantiated as-is, if no queries and actions are required
    for a given store.

    The following names of ``Service`` class members are reserved and shall not
    be used for store-specific queries and actions in derived service classes:

    - ``_init_app`` - FastAPI instance initialization
    - ``store`` - property that provides reactive state container
    - ``get`` - built-in query to get a state value
    - ``set`` - built-in action to set a state value
    - ``notify`` - report task updates

    Args:
        store: The reactive state container.
    """

    _store: Store
    _actions: dict[str, Callable]
    _queries: dict[str, Callable]

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        cls._actions = {}
        cls._queries = {}

        for base in reversed(cls.__mro__[1:]):
            cls._actions.update(getattr(base, "_actions", {}))
            cls._queries.update(getattr(base, "_queries", {}))

        for name, value in list(cls.__dict__.items()):
            if name in _BUILTIN_SERVICE_METHODS:
                raise TypeError(
                    f"{cls.__name__}.{name} conflicts with a built-in "
                    "RemoteState service method"
                )
            if isinstance(value, _ActionMarker):
                cls._actions[name] = value.fn
                setattr(cls, name, value.fn)
            elif isinstance(value, _QueryMarker):
                cls._queries[name] = value.fn
                setattr(cls, name, value.fn)

    def __init__(self, store: Store) -> None:
        """Create a service bound to a reactive store.

        Args:
            store: The reactive state container exposed through the service.
        """
        self._store = store

    def _init_app(self, app: FastAPI):
        """Initialize the FastAPI app used by the service.

        Override this method to add routes, middleware, or other FastAPI
        configuration.

        Only called if the FastAPI instance was newly created by the remotestate server.
        Not called if the user provided an app instance to the remotestate server.

        The default implementation does nothing.

        Args:
            app: FastAPI instance owned by the remotestate server.

        Returns:
            None.
        """

    @property
    def store(self) -> Store:
        """Store: The reactive state container."""
        return self._store

    @query
    def get(self, path: str = "") -> Any:
        """Built-in query that returns a store value by path.

        This is the read side of the generic bridge used by the TypeScript
        ``useRemoteState()`` hook and related helpers.

        Args:
            path: RemoteState path to read. If omitted, reads the root state
                value.

        Returns:
            The value at ``path``, or ``None`` when the path is missing.
        """
        return self.store.get(path)

    @action
    def set(self, path: str, value: Any) -> None:
        """Built-in action that sets a store value by path.

        This is the write-side of the generic bridge used by the TypeScript
        ``useRemoteState()`` hook and related helpers, so a simple UI state does
        not require a custom action on every user service.

        Args:
            path: RemoteState path to write.
            value: New value to assign at ``path``.

        Returns:
            None.
        """
        self.store.set(path, value)

    # noinspection PyMethodMayBeStatic
    def notify(
        self,
        *,
        name: str | None = None,
        detail: str | None = None,
        progress: float | None = None,
    ) -> None:
        """Report status changes of the current action or query.

        Fire-and-forget — does not block the caller. Safe to call from
        both @action and @query methods. Has no effect if called outside
        a dispatched action or query (e.g., during testing).

        Args:
            name: Optional short task name for display.
            detail: Optional task detail for display.
            progress: Optional progress percentage from 0 to 100.

        Returns:
            None.
        """
        ctx = _call_context.get()
        if ctx is None or ctx.task_id is None:
            return

        message = TaskUpdateMessage(
            type="update_task",
            call_id=ctx.call_id,
            task_id=ctx.task_id,
            method=ctx.method,
            status="running",
            name=name,
            detail=detail,
            progress=progress,
        )
        message_coro = ctx.sender(message)
        # create_task() is safe here — notify() is always called from within
        # a running async handler, so the event loop is guaranteed to exist.
        # noinspection PyTypeChecker
        asyncio.create_task(message_coro)

    async def _rs_invoke_action(
        self,
        method: str,
        args: list[Any],
        kwargs: dict[str, Any],
        call_id: str,
        task_id: str | None,
        sender: Callable[[TaskUpdateMessage], Coroutine[Any, Any, None]],
    ) -> PendingUpdates:
        """Invoke one registered action inside a tracked call scope.

        Args:
            method: Name of the registered action.
            args: Positional arguments from the client.
            kwargs: Keyword arguments from the client.
            call_id: Internal request ID for protocol correlation.
            task_id: Optional task ID for progress updates.
            sender: Coroutine used to emit ``TaskUpdateMessage`` objects.

        Returns:
            The batched store updates produced by the action.
        """

        fn = self._actions.get(method)
        if fn is None:
            raise ValueError(f"No action {method!r}")

        token = _call_context.set(
            _CallContext(
                call_id=call_id,
                task_id=task_id,
                method=method,
                sender=sender,
                readonly=False,
            )
        )
        try:
            with _batch_pending_updates() as pending:
                await fn(self, *args, **kwargs)
            # noinspection PyProtectedMember
            self.store._flush(pending)
            return pending
        finally:
            _call_context.reset(token)

    async def _rs_invoke_query(
        self,
        method: str,
        args: list[Any],
        kwargs: dict[str, Any],
        call_id: str,
        task_id: str | None,
        sender: Callable[[TaskUpdateMessage], Coroutine[Any, Any, None]],
    ) -> Any:
        """Invoke one registered query inside a read-only call scope.

        Args:
            method: Name of the registered query.
            args: Positional arguments from the client.
            kwargs: Keyword arguments from the client.
            call_id: Internal request ID for protocol correlation.
            task_id: Optional task ID for progress updates.
            sender: Coroutine used to emit ``TaskUpdateMessage`` objects.

        Returns:
            The query result returned by the user-defined method.
        """

        fn = self._queries.get(method)
        if fn is None:
            raise ValueError(f"No query {method!r}")

        token = _call_context.set(
            _CallContext(
                call_id=call_id,
                task_id=task_id,
                method=method,
                sender=sender,
                readonly=True,
            )
        )
        try:
            return await fn(self, *args, **kwargs)
        finally:
            _call_context.reset(token)


Service._actions = {}
Service._queries = {}
for _name, _value in list(Service.__dict__.items()):
    if isinstance(_value, _ActionMarker):
        Service._actions[_name] = _value.fn
        setattr(Service, _name, _value.fn)
    elif isinstance(_value, _QueryMarker):
        Service._queries[_name] = _value.fn
        setattr(Service, _name, _value.fn)
