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


class Service:
    """Implements the Python queries and actions exposed over the websocket bridge.

    Subclasses define ``@action`` and ``@query`` methods. Dispatch helpers take
    care of call scoping, read-only enforcement for queries, and batched store
    update reporting after actions complete.

    The base class also provides the built-in ``get_state`` query and ``set_state``
    action used by the generic React bridge.

    ``Service`` may serve as a base class for store-specific queries and actions,
    but it can also be instantiated as-is, if no queries and actions are required
    for a given store.

    The following names of ``Service`` class members are reserved and shall not
    be used for store-specific queries and actions in derived service classes:

    - ``init_app`` - FastAPI instance initialization
    - ``store`` - property that provides reactive state container
    - ``get_state`` - built-in query to get a state value
    - ``set_state`` - built-in action to set a state value
    - ``update_task`` - report task updates

    Argument:
        store: The reactive state container.
    """

    _store: Store
    _actions: dict[str, Callable]
    _queries: dict[str, Callable]

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        cls._actions = {}
        cls._queries = {}

        for name, value in inspect.getmembers(cls):
            if isinstance(value, _ActionMarker):
                cls._actions[name] = value.fn
                setattr(cls, name, value.fn)
            elif isinstance(value, _QueryMarker):
                cls._queries[name] = value.fn
                setattr(cls, name, value.fn)

    def __init__(self, store: Store) -> None:
        self._store = store

    def init_app(self, app: FastAPI):
        """
        Initialize the new FastAPI instance used by the service,
        for example, in order to add routes for a REST API.

        Only called if the FastAPI instance was newly created by the remotestate server.
        Not called if the user provided an app instance to the remotestate server.

        The default implementation does nothing.
        """

    @property
    def store(self) -> Store:
        """The reactive state container."""
        return self._store

    @query
    def get_state(self, path: str) -> Any:
        """Built-in query that returns a store value by path.

        This is the read side of the generic bridge used by the TypeScript
        ``useRemoteState()`` hook and related helpers.
        """
        return self.store.get(path)

    @action
    def set_state(self, path: str, value: Any) -> None:
        """Built-in action that sets a store value by path.

        This is the write side of the generic bridge used by the TypeScript
        ``useRemoteState()`` hook and related helpers, so simple UI state does
        not require a custom action on every user service.
        """
        self.store.set(path, value)

    # noinspection PyMethodMayBeStatic
    def update_task(
        self,
        *,
        name: str | None = None,
        detail: str | None = None,
        progress: float | None = None,
    ) -> None:
        """Report progress of the current action or query.

        Fire-and-forget — does not block the caller. Safe to call from
        both @action and @query methods. Has no effect if called outside
        a dispatched action or query (e.g. during testing).
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
        # create_task() is safe here — update_task() is always called from within
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
            The batched local store updates produced by the action.
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
