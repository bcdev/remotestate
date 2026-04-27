# pyre/server.py
from __future__ import annotations

import logging

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import TypeAdapter

from pyre.protocol import (
    ActionMessage,
    ErrorMessage,
    GetMessage,
    GetResultMessage,
    IncomingMessage,
    InvalidateMessage,
    OutgoingMessage,
    QueryMessage,
    QueryResultMessage,
    TaskUpdateMessage,
)
from pyre.service import PythonService
from pyre.transport import PyreTransport

_incoming_adapter = TypeAdapter(IncomingMessage)


class WebSocketTransport(PyreTransport):
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
        logging.getLogger("uvicorn.error").warning("HELLO FROM _handle_ws")
        await websocket.accept()
        self._connections.add(websocket)
        try:
            while True:
                msg_text = await websocket.receive_text()
                try:
                    msg = _incoming_adapter.validate_json(msg_text, by_alias=True)
                except Exception as e:
                    _write_error(e, msg_text)
                    msg = None
                    logging.getLogger("uvicorn").error(
                        "invalid message received", exc_info=True
                    )
                    await self.send(
                        ErrorMessage(type="error", id="unknown", message=str(e))
                    )
                if msg is not None:
                    await handler(msg)
        except WebSocketDisconnect:
            pass
        finally:
            self._connections.discard(websocket)


class PyreServer:
    def __init__(
        self,
        service: PythonService,
        *,
        ui_dist_path: str | None = None,
    ) -> None:
        self._store = service.store
        self._service = service
        self._transport = WebSocketTransport()
        self._app = self._build_app(ui_dist_path)

    def _build_app(self, ui_dist_path: str | None) -> FastAPI:
        app = FastAPI()

        @app.websocket("/ws")
        async def ws_endpoint(websocket: WebSocket) -> None:
            # noinspection PyProtectedMember
            await self._transport._handle_ws(websocket, self._dispatch)

        if ui_dist_path:
            app.mount("/", StaticFiles(directory=ui_dist_path, html=True), name="ui")

        return app

    @property
    def app(self) -> FastAPI:
        return self._app

    def _make_sender(self) -> Callable[[TaskUpdateMessage], Awaitable[None]]:
        async def sender(msg: TaskUpdateMessage) -> None:
            await self._transport.send(msg)

        return sender

    # noinspection PyShadowingBuiltins,PyProtectedMember
    async def _dispatch(self, msg: IncomingMessage) -> None:
        try:
            await self.__dispatch(msg)
        except Exception as e:
            logging.getLogger("uvicorn").error(
                "unknown message received", exc_info=True
            )
            await self._transport.send(
                ErrorMessage(type="error", id=msg.id, message=str(e))
            )

    async def __dispatch(self, msg: IncomingMessage) -> None:
        match msg:
            case GetMessage(id=id, path=path):
                value = self._store.get(path)
                await self._transport.send(
                    GetResultMessage(type="get_result", id=id, path=path, value=value)
                )

            case ActionMessage(id=id, tid=tid, method=method, args=args, kwargs=kwargs):
                updates = await self._service._pyre_invoke_action(
                    method,
                    args,
                    kwargs,
                    call_id=id,
                    task_id=tid,
                    sender=self._make_sender(),
                )
                await self._transport.send(
                    InvalidateMessage(type="invalidate", id=id, updates=updates)
                )

            case QueryMessage(id=id, tid=tid, method=method, args=args, kwargs=kwargs):
                result = await self._service._pyre_invoke_query(
                    method,
                    args,
                    kwargs,
                    call_id=id,
                    task_id=tid,
                    sender=self._make_sender(),
                )
                await self._transport.send(
                    QueryResultMessage(type="query_result", id=id, value=result)
                )
            case _:
                logging.getLogger("uvicorn").error("received unknown ws message")


def _write_error(e: Exception, msg_text: str) -> None:
    import pathlib
    import traceback
    import uuid

    content = "".join(
        [
            *traceback.format_exception(e),
            "\n\nFor message:\n\n",
            msg_text + "\n",
        ]
    )
    pathlib.Path(f"pyre-error-{uuid.uuid4()}.txt").write_text(content)
