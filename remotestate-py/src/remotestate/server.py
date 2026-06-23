from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import TypeAdapter
from starlette.staticfiles import PathLike

from .context import _suppress_store_broadcast
from .log import LOG
from .protocol import (
    ActionMessage,
    ActionResultMessage,
    ErrorMessage,
    GetMessage,
    GetResultMessage,
    IncomingMessage,
    OutgoingMessage,
    QueryMessage,
    QueryResultMessage,
    SetMessage,
    SetResultMessage,
    StateUpdate,
    TaskUpdateMessage,
)
from .service import Service
from .store import PendingUpdates, _batch_pending_updates
from .transport import Transport

_IncomingAdapter: TypeAdapter[IncomingMessage] = TypeAdapter(IncomingMessage)


class Server:
    """``remotestate`` server that uses a WebSockets transport."""

    def __init__(
        self,
        service: Service,
        *,
        mounts: dict[str, PathLike | StaticFiles] | None = None,
        app: FastAPI | None = None,
    ) -> None:
        self._store = service.store
        self._service = service
        self._transport = WebSocketTransport()
        self._unsubscribe_store = self._store.subscribe(self._broadcast_store_update)
        self._app = app if app is not None else FastAPI()
        self._init_app(mounts)
        if app is None:
            # noinspection PyProtectedMember
            self._service._init_app(self._app)

    @property
    def app(self) -> FastAPI:
        return self._app

    @property
    def service(self) -> Service:
        return self._service

    def _init_app(self, mounts: dict[str, PathLike | StaticFiles] | None) -> None:
        app = self._app
        assert isinstance(app, FastAPI)

        @app.websocket("/ws")
        async def ws_endpoint(websocket: WebSocket) -> None:
            # noinspection PyProtectedMember
            await self._transport._handle_ws(websocket, self._dispatch)

        if mounts:
            for k, v in mounts.items():
                if isinstance(v, StaticFiles):
                    files = v
                else:
                    files = StaticFiles(directory=v)
                app.mount(k, files)

    def _make_sender(self) -> Callable[[TaskUpdateMessage], Coroutine[Any, Any, None]]:
        async def sender(msg: TaskUpdateMessage) -> None:
            await self._transport.send(msg)

        return sender

    def _broadcast_store_update(self, updates: PendingUpdates) -> None:
        # Dispatched actions and store set messages return their updates in the
        # matching result message. This subscription is for Python-side
        # store.set() calls that happen outside a dispatched request.
        if _suppress_store_broadcast.get():
            return
        self._transport.send_nowait(
            SetResultMessage(
                call_id="store_update",
                updates=_protocol_updates(updates),
            )
        )

    # noinspection PyProtectedMember
    async def _dispatch(self, msg: IncomingMessage) -> None:
        try:
            await self.__dispatch(msg)
        except Exception as e:
            error_message = f"Error while dispatching message of type {type!r}: {e}"
            LOG.error(error_message, exc_info=True)
            await self._transport.send(
                ErrorMessage(call_id=msg.call_id, message=error_message)
            )

    async def __dispatch(self, msg: IncomingMessage) -> None:
        # noinspection PyShadowingBuiltins
        match msg:
            case GetMessage(call_id=call_id, path=path):
                value = self._store.get(path)
                await self._transport.send(
                    GetResultMessage(call_id=call_id, path=path, value=value)
                )

            case SetMessage(call_id=call_id, path=path, value=value):
                token = _suppress_store_broadcast.set(True)
                try:
                    with _batch_pending_updates() as pending:
                        self._store.set(path, value)
                    # noinspection PyProtectedMember
                    self._store._flush(pending)
                    await self._transport.send(
                        SetResultMessage(
                            call_id=call_id,
                            updates=_protocol_updates(pending),
                        )
                    )
                finally:
                    _suppress_store_broadcast.reset(token)

            case ActionMessage(
                call_id=call_id,
                task_id=task_id,
                method=method,
                args=args,
                kwargs=kwargs,
            ):
                # noinspection PyProtectedMember
                updates = await self._service._rs_invoke_action(
                    method,
                    args,
                    kwargs,
                    call_id=call_id,
                    task_id=task_id,
                    sender=self._make_sender(),
                )
                await self._transport.send(
                    ActionResultMessage(
                        call_id=call_id,
                        updates=_protocol_updates(updates),
                    )
                )

            case QueryMessage(
                call_id=call_id,
                task_id=task_id,
                method=method,
                args=args,
                kwargs=kwargs,
            ):
                # noinspection PyProtectedMember
                result = await self._service._rs_invoke_query(
                    method,
                    args,
                    kwargs,
                    call_id=call_id,
                    task_id=task_id,
                    sender=self._make_sender(),
                )
                await self._transport.send(
                    QueryResultMessage(call_id=call_id, value=result)
                )
            case _:
                # We should really not arrive here
                raise AssertionError(f"Unknown message type {msg.type!r}")


def _protocol_updates(updates: PendingUpdates) -> list[StateUpdate]:
    return [StateUpdate(path=path, value=value) for path, value in updates.items()]


class WebSocketTransport(Transport):
    """Transport implementation for WebSockets."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def send(self, msg: OutgoingMessage) -> None:
        data = msg.model_dump_json(by_alias=True)
        dead = set()
        for ws in self._connections:
            # noinspection PyBroadException
            try:
                await ws.send_text(data)
            except Exception:
                dead.add(ws)
        self._connections -= dead

    async def close(self) -> None:
        for ws in self._connections:
            await ws.close()
        self._connections.clear()

    def send_nowait(self, msg: OutgoingMessage) -> None:
        """Schedule a message broadcast from sync Python code."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None
        if running_loop is loop:
            loop.create_task(self.send(msg))
        else:
            asyncio.run_coroutine_threadsafe(self.send(msg), loop)

    async def _handle_ws(
        self,
        websocket: WebSocket,
        handler: Callable[[IncomingMessage], Awaitable[None]],
    ) -> None:
        await websocket.accept()
        self._loop = asyncio.get_running_loop()
        self._connections.add(websocket)
        try:
            while True:
                msg_text = await websocket.receive_text()
                try:
                    msg = _IncomingAdapter.validate_json(msg_text, by_alias=True)
                except Exception as e:
                    msg = None
                    error_mag = f"WebSocket message decoding failed: {e}"
                    LOG.exception(error_mag)
                    await self.send(ErrorMessage(call_id="unknown", message=error_mag))
                if msg is not None:
                    await handler(msg)
        except WebSocketDisconnect:
            pass
        finally:
            self._connections.discard(websocket)
