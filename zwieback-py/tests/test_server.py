from unittest.mock import AsyncMock

import pytest

from zwieback.protocol import (
    ActionMessage,
    ErrorMessage,
    GetMessage,
    GetResultMessage,
    InvalidateMessage,
    QueryMessage,
    QueryResultMessage,
)
from zwieback.server import Server, WebSocketTransport
from zwieback.service import Service, action, query
from zwieback.store import Store

# --- Fixtures ---


@pytest.fixture
def store():
    return Store({"count": 0, "user": {"name": "Norman"}})


@pytest.fixture
def service(store):
    class MyService(Service):
        @action
        async def increment(self):
            self.store.set("count", self.store.get("count") + 1)

        @query
        async def get_count(self) -> int:
            return self.store.get("count")

    return MyService(store)


@pytest.fixture
def server(service):
    return Server(service)


# --- WebSocketTransport ---

# The transport keeps a set of active connections and broadcasts to all of them.
# If a connection is dead (send raises), it is silently removed.


@pytest.mark.asyncio
async def test_transport_broadcast_to_all_connections():
    transport = WebSocketTransport()

    ws1 = AsyncMock()
    ws2 = AsyncMock()
    transport._connections = {ws1, ws2}

    msg = GetResultMessage(id="1", path="count", value=0)
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

    msg = GetResultMessage(id="1", path="count", value=0)
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


# --- Queue ---

# The store callback (_on_store_update) is synchronous and may run in any
# thread — e.g. the Jupyter kernel thread. It must never touch the event loop.
# It simply puts a message into a thread-safe queue.SimpleQueue.
#
# The broadcaster coroutine runs inside the uvicorn event loop. It calls
# queue.get() via run_in_executor so the blocking call does not freeze the loop.


# --- Dispatch ---

# The dispatcher routes incoming protocol messages to the correct handler:
#   GetMessage  → store.get → ValueMessage
#   CallMessage → service action → (store mutation, no return value)
#   InvokeMessage → service query → InvokeResultMessage


@pytest.mark.asyncio
async def test_dispatch_get(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(GetMessage(id="abc", path="count"))

    assert len(sent) == 1
    assert isinstance(sent[0], GetResultMessage)
    assert sent[0].id == "abc"
    assert sent[0].value == 0


@pytest.mark.asyncio
async def test_dispatch_call_action(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        ActionMessage(id="abc", tid="abc", method="increment", args=[], kwargs={})
    )

    assert server._store.get("count") == 1
    assert isinstance(sent[0], InvalidateMessage)
    assert sent[0].id == "abc"
    assert "count" in sent[0].updates


@pytest.mark.asyncio
async def test_dispatch_call_unknown_action(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        ActionMessage(id="abc", tid="abc", method="nonexistent", args=[], kwargs={})
    )

    assert isinstance(sent[0], ErrorMessage)
    assert sent[0].id == "abc"


@pytest.mark.asyncio
async def test_dispatch_invoke_query(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        QueryMessage(id="xyz", tid="xyz", method="get_count", args=[], kwargs={})
    )

    assert isinstance(sent[0], QueryResultMessage)
    assert sent[0].id == "xyz"
    assert sent[0].value == 0


@pytest.mark.asyncio
async def test_dispatch_invoke_unknown_query(server):
    sent = []
    server._transport.send = AsyncMock(side_effect=lambda m: sent.append(m))

    await server._dispatch(
        QueryMessage(id="xyz", tid="xyz", method="nonexistent", args=[], kwargs={})
    )

    assert isinstance(sent[0], ErrorMessage)
    assert sent[0].id == "xyz"
