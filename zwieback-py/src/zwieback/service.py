# zwieback/service.py
from __future__ import annotations

import asyncio
import functools
import inspect
from collections.abc import Callable
from typing import Any, Awaitable

from zwieback.context import _call_context, _CallContext
from zwieback.protocol import TaskUpdateMessage
from zwieback.store import PendingUpdates, Store, _batch_pending_updates


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
    """Base class for Python services exposed over the websocket bridge.

    Subclasses define ``@action`` and ``@query`` methods. Dispatch helpers take
    care of call scoping, read-only enforcement for queries, and batched store
    invalidation after actions complete.
    """

    store: Store
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
        self.store = store

    @action
    def set_state(self, path: str, value: Any) -> None:
        """Set a store value by path.

        This built-in action enables simple UI patterns such as a
        zwieback-side `useState(path, initial)` helper without requiring a
        custom action on every user service.
        """
        self.store.set(path, value)

    def progress(
        self,
        *,
        name: str | None = None,
        detail: str | None = None,
        progress: float | None = None,
    ) -> None:
        """Report progress of the current action or query.

        Fire-and-forget — does not block the caller. Safe to call from
        both @action and @query methods. Has no effect if called outside
        of a dispatched action or query (e.g. during testing).
        """
        ctx = _call_context.get()
        if ctx is None or ctx.task_id is None:
            return

        message = TaskUpdateMessage(
            type="task_update",
            id=ctx.call_id,
            task_id=ctx.task_id,
            method=ctx.method,
            status="running",
            name=name,
            detail=detail,
            progress=progress,
        )
        message_coro = ctx.sender(message)
        # create_task is safe here — progress() is always called from within
        # a running async handler, so the event loop is guaranteed to exist.
        # noinspection PyTypeChecker
        asyncio.create_task(message_coro)

    async def _zw_invoke_action(
        self,
        method: str,
        args: list[Any],
        kwargs: dict[str, Any],
        call_id: str,
        task_id: str | None,
        sender: Callable[[TaskUpdateMessage], Awaitable[None]],
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
            self.store._flush(pending)
            return pending
        finally:
            _call_context.reset(token)

    async def _zw_invoke_query(
        self,
        method: str,
        args: list[Any],
        kwargs: dict[str, Any],
        call_id: str,
        task_id: str | None,
        sender: Callable[[TaskUpdateMessage], Awaitable[None]],
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
