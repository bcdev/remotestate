from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI

from remotestate.protocol import (
    ActionMessage,
    ErrorMessage,
    GetMessage,
    GetResultMessage,
    SetMessage,
    SetResultMessage,
    ActionResultMessage,
    QueryMessage,
    QueryResultMessage,
    StateUpdate,
)
from remotestate.server import Server, WebSocketTransport
from remotestate.service import Service, action, query
from remotestate.store import Store

# --- Fixtures ---


@pytest.fixture
def store():
    return Store({"count": 0, "user": {"name": "Norman"}})


@pytest.fixture
def service(store):
    class MyService(Service):
        the_app: FastAPI

        def _init_app(self, app: FastAPI):
            self.the_app = app

        @action
        async def increment(self):
            self.store.set("count", self.store.get("count") + 1)

        @action
        async def multi_set(self):
            self.store.set("count", 7)
            self.store.set("user.name", "Klaus")

        @query
        async def get_count(self) -> int:
            return self.store.get("count")

    return MyService(store)


@pytest.fixture
def server(service):
    return Server(service)


# --- App configuration ---


def test_configure_app_called(server):
    service = server.service
    assert hasattr(service, "the_app")
    assert isinstance(service.the_app, FastAPI)


def test_external_store_set_broadcasts_update(server):
    server._transport.send_nowait = MagicMock()

    server._store.set("count", 7)

    server._transport.send_nowait.assert_called_once()
    sent = server._transport.send_nowait.call_args[0][0]
    assert isinstance(sent, SetResultMessage)
    assert sent.call_id == "store_update"
    assert sent.updates == [StateUpdate(path=("count",), value=7)]


@pytest.mark.asyncio
async def test_action_store_set_does_not_broadcast_duplicate_update(server):
    server._transport.send = AsyncMock()
    server._transport.send_nowait = MagicMock()

    await server._dispatch(
        ActionMessage(
            call_id="abc", task_id="abc", method="increment", args=[], kwargs={}
        )
    )

    server._transport.send_nowait.assert_not_called()


# --- WebSocketTransport ---

# The transport keeps a set of active connections and broadcasts to all of them.
# If a connection is dead (send raises), it is silently removed.


@pytest.mark.asyncio
async def test_transport_broadcast_to_all_connections():
    transport = WebSocketTransport()

    ws1 = AsyncMock()
    ws2 = AsyncMock()
    transport._connections = {ws1, ws2}

    msg = GetResultMessage(call_id="1", path=("count",), value=0)
    await transport.send(msg)

    ws1.send_text.assert_called_once_with(msg.model_dump_json())
    ws2.send_text.assert_called_once_with(msg.model_dump_json())


@pytest.mark.asyncio
async def test_transport_removes_dead_connections():
    transport = WebSocketTransport()

    dead_ws = AsyncMock()
    dead_ws.send_text.side_effect = Exception("connection lost")
    live_ws = AsyncMock()
    transport._connections = {dead_ws, live_ws}

    msg = GetResultMessage(call_id="1", path=("count",), value=0)
    await transport.send(msg)

    assert dead_ws not in transport._connections
    assert live_ws in transport._connections


@pytest.mark.asyncio
async def test_transport_close_clears_connections():
    transport = WebSocketTransport()
    ws1, ws2 = AsyncMock(), AsyncMock()
    transport._connections = {ws1, ws2}

    await transport.close()

    ws1.close.assert_called_once()
    ws2.close.assert_called_once()
    assert len(transport._connections) == 0


# --- Dispatch ---

# The dispatcher routes incoming protocol messages to the correct handler:
#   GetMessage → store.get → GetResultMessage
#   SetMessage → store.set → SetResultMessage
#   ActionMessage → service action → ActionResultMessage
#   QueryMessage → service query → QueryResultMessage


@pytest.mark.asyncio
async def test_dispatch_get(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(GetMessage(call_id="abc", path=("count",)))

    assert len(sent) == 1
    assert isinstance(sent[0], GetResultMessage)
    assert sent[0].call_id == "abc"
    assert sent[0].value == 0


@pytest.mark.asyncio
async def test_dispatch_call_action(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        ActionMessage(
            call_id="abc", task_id="abc", method="increment", args=[], kwargs={}
        )
    )

    assert server._store.get("count") == 1
    assert isinstance(sent[0], ActionResultMessage)
    assert sent[0].call_id == "abc"
    assert StateUpdate(path=("count",), value=1) in sent[0].updates


@pytest.mark.asyncio
async def test_dispatch_action_batches_store_updates(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))
    server._transport.send_nowait = MagicMock()

    await server._dispatch(
        ActionMessage(
            call_id="abc", task_id="abc", method="multi_set", args=[], kwargs={}
        )
    )

    server._transport.send_nowait.assert_not_called()
    assert len(sent) == 1
    assert isinstance(sent[0], ActionResultMessage)
    assert sent[0].call_id == "abc"
    assert sent[0].updates == [
        StateUpdate(path=("count",), value=7),
        StateUpdate(path=("user", "name"), value="Klaus"),
    ]


@pytest.mark.asyncio
async def test_dispatch_set(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))
    server._transport.send_nowait = MagicMock()

    await server._dispatch(SetMessage(call_id="abc", path=("count",), value=7))

    assert len(sent) == 1
    assert server._store.get("count") == 7
    assert isinstance(sent[0], SetResultMessage)
    assert sent[0].call_id == "abc"
    assert sent[0].updates == [StateUpdate(path=("count",), value=7)]
    server._transport.send_nowait.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_set_root(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(SetMessage(call_id="abc", path=(), value={"count": 7}))

    assert len(sent) == 1
    assert server._store.get("count") == 7
    assert isinstance(sent[0], SetResultMessage)
    assert sent[0].updates == [StateUpdate(path=(), value={"count": 7})]


@pytest.mark.asyncio
async def test_dispatch_call_unknown_action(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        ActionMessage(
            call_id="abc", task_id="abc", method="nonexistent", args=[], kwargs={}
        )
    )

    assert isinstance(sent[0], ErrorMessage)
    assert sent[0].call_id == "abc"


@pytest.mark.asyncio
async def test_dispatch_invoke_query(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        QueryMessage(
            call_id="xyz", task_id="xyz", method="get_count", args=[], kwargs={}
        )
    )

    assert isinstance(sent[0], QueryResultMessage)
    assert sent[0].call_id == "xyz"
    assert sent[0].value == 0


@pytest.mark.asyncio
async def test_dispatch_invoke_unknown_query(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        QueryMessage(
            call_id="xyz", task_id="xyz", method="nonexistent", args=[], kwargs={}
        )
    )

    assert isinstance(sent[0], ErrorMessage)
    assert sent[0].call_id == "xyz"
