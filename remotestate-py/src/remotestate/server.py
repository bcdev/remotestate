from __future__ import annotations

from collections.abc import Awaitable, Callable, Coroutine

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from starlette.staticfiles import PathLike
from pydantic import TypeAdapter

from .protocol import (
    ActionMessage,
    ErrorMessage,
    GetMessage,
    GetResultMessage,
    IncomingMessage,
    ActionResultMessage,
    OutgoingMessage,
    QueryMessage,
    QueryResultMessage,
    TaskUpdateMessage,
)
from .service import Service
from .transport import Transport
from .log import LOG


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
        self._app = app if app is not None else FastAPI()
        self._init_app(mounts)
        if app is None:
            self._service.init_app(self._app)

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

            case ActionMessage(
                call_id=call_id,
                task_id=task_id,
                method=method,
                args=args,
                kwargs=kwargs,
            ):
                # noinspection PyProtectedMember
                updates = await self._service._zw_invoke_action(
                    method,
                    args,
                    kwargs,
                    call_id=call_id,
                    task_id=task_id,
                    sender=self._make_sender(),
                )
                await self._transport.send(
                    ActionResultMessage(call_id=call_id, updates=updates)
                )

            case QueryMessage(
                call_id=call_id,
                task_id=task_id,
                method=method,
                args=args,
                kwargs=kwargs,
            ):
                # noinspection PyProtectedMember
                result = await self._service._zw_invoke_query(
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


class WebSocketTransport(Transport):
    """Transport implementation for WebSockets."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

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

    async def _handle_ws(
        self,
        websocket: WebSocket,
        handler: Callable[[IncomingMessage], Awaitable[None]],
    ) -> None:
        await websocket.accept()
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
