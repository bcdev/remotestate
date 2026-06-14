import asyncio
from unittest.mock import MagicMock

import pytest

# noinspection PyProtectedMember
from remotestate.context import _call_context
from remotestate.protocol import TaskUpdateMessage
from remotestate.service import Service, action, query
from remotestate.store import Store
from tests.conftest import make_sender

# --- Fixtures ---


@pytest.fixture
def store():
    return Store(
        {
            "count": 0,
            "user": {"name": "Norman"},
            "factor": 3,
        },
    )


def make_service(store: Store) -> Service:
    class MyService(Service):
        @action
        async def increment(self):
            self.store.set("count", self.store.get("count") + 1)

        @action
        async def set_name(self, name: str):
            self.store.set("user.name", name)

        @action
        async def multi_set(self):
            self.store.set("count", 99)
            self.store.set("user.name", "Klaus")

        @action
        async def set_with_progress(self):
            self.update_task(name="Preparing", progress=16)
            self.store.set("count", 1)

        @query
        async def get_count(self) -> int:
            return self.store.get("count")

        @query
        async def compute(self, x: float) -> float:
            return x * self.store.get("factor")

        @query
        async def compute_with_progress(self, x: float) -> float:
            self.update_task(name="Working", progress=53)
            return x * self.store.get("factor")

        @action
        def sync_action(self):
            self.store.set("count", 42)

        @query
        def sync_query(self) -> int:
            return self.store.get("count")

    return MyService(store)


def invoke_action(service, method, *, args=None, kwargs=None):
    sender, sender_impl = make_sender()
    # noinspection PyProtectedMember
    return (
        service._rs_invoke_action(
            method,
            args or [],
            kwargs or {},
            call_id="test-call-id",
            task_id="test-task-id",
            sender=sender,
        ),
        sender_impl,
    )


def invoke_action_without_task_id(service, method, *, args=None, kwargs=None):
    sender, sender_impl = make_sender()
    # noinspection PyProtectedMember
    return (
        service._rs_invoke_action(
            method,
            args or [],
            kwargs or {},
            call_id="test-call-id",
            task_id=None,
            sender=sender,
        ),
        sender_impl,
    )


def invoke_query(service, method, args=None, kwargs=None):
    sender, _sender_impl = make_sender()
    # noinspection PyProtectedMember
    return (
        service._rs_invoke_query(
            method,
            args or [],
            kwargs or {},
            call_id="test-call-id",
            task_id="test-task-id",
            sender=sender,
        ),
        _sender_impl,
    )


# --- action dispatch ---


@pytest.mark.asyncio
async def test_action_mutates_store(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "increment")
    await coro
    assert store.get("count") == 1


@pytest.mark.asyncio
async def test_action_with_args(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "set_name", args=["Klaus"])
    await coro
    assert store.get("user.name") == "Klaus"


@pytest.mark.asyncio
async def test_action_batch_single_notify(store):
    service = make_service(store)
    cb = MagicMock()
    store.subscribe(cb)
    coro, _ = invoke_action(service, "multi_set")
    await coro
    assert cb.call_count == 1


@pytest.mark.asyncio
async def test_action_returns_updates(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "increment")
    updates = await coro
    assert "count" in updates


@pytest.mark.asyncio
async def test_action_unknown_raises(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "nonexistent")
    with pytest.raises(ValueError, match="No action"):
        await coro


@pytest.mark.asyncio
async def test_sync_action_works(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "sync_action")
    await coro
    assert store.get("count") == 42


# --- query dispatch ---


@pytest.mark.asyncio
async def test_query_returns_value(store):
    service = make_service(store)
    coro, _ = invoke_query(service, "get_count")
    result = await coro
    assert result == 0


@pytest.mark.asyncio
async def test_query_with_args(store):
    service = make_service(store)
    coro, _ = invoke_query(service, "compute", args=[5.0])
    result = await coro
    assert result == 15.0


@pytest.mark.asyncio
async def test_query_cannot_mutate(store):
    class BadService(Service):
        @query
        async def bad(self):
            self.store.set("count", 1)

    svc = BadService(store)
    coro, _ = invoke_query(svc, "bad")
    with pytest.raises(PermissionError):
        await coro


@pytest.mark.asyncio
async def test_query_unknown_raises(store):
    service = make_service(store)
    coro, _ = invoke_query(service, "nonexistent")
    with pytest.raises(ValueError, match="No query"):
        await coro


@pytest.mark.asyncio
async def test_query_works_if_sync(store):
    service = make_service(store)
    coro, _ = invoke_query(service, "sync_query")
    result = await coro
    assert result == 0


# --- call context ---


@pytest.mark.asyncio
async def test_call_context_reset_after_action(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "increment")
    await coro
    assert _call_context.get() is None


@pytest.mark.asyncio
async def test_call_context_reset_after_query(store):
    service = make_service(store)
    coro, _ = invoke_query(service, "get_count")
    await coro
    assert _call_context.get() is None


@pytest.mark.asyncio
async def test_call_context_reset_after_error(store):
    service = make_service(store)
    coro, _ = invoke_action(service, "nonexistent")
    with pytest.raises(ValueError):
        await coro
    assert _call_context.get() is None


# --- update_task ---


@pytest.mark.asyncio
async def test_update_task_calls_sender_from_action(store):
    service = make_service(store)
    coro, sender_impl = invoke_action(service, "set_with_progress")
    await coro
    await asyncio.sleep(0.01)
    sender_impl.assert_called_once()
    sender_impl.assert_awaited_once_with(
        TaskUpdateMessage(
            method="set_with_progress",
            call_id="test-call-id",
            task_id="test-task-id",
            status="running",
            name="Preparing",
            progress=16.0,
        )
    )


@pytest.mark.asyncio
async def test_update_task_calls_sender_from_query(store):
    service = make_service(store)
    coro, sender_impl = invoke_query(service, "compute_with_progress", args=[3])
    await coro
    await asyncio.sleep(0.01)
    sender_impl.assert_called_once()
    sender_impl.assert_awaited_once()
    sender_impl.assert_awaited_once_with(
        TaskUpdateMessage(
            method="compute_with_progress",
            call_id="test-call-id",
            task_id="test-task-id",
            status="running",
            name="Working",
            progress=53.0,
        )
    )


@pytest.mark.asyncio
async def test_update_task_no_effect_outside_dispatch(store):
    service = make_service(store)
    # Should not raise — just silently does nothing
    service.update_task(name="test", progress=50)


@pytest.mark.asyncio
async def test_update_task_no_effect_without_task_id(store):
    service = make_service(store)
    coro, sender_impl = invoke_action_without_task_id(service, "set_with_progress")
    await coro
    await asyncio.sleep(0.01)
    sender_impl.assert_not_called()


@pytest.mark.asyncio
async def test_update_task_available_in_query(store):
    class ProgressQuery(Service):
        @query
        async def slow_query(self) -> int:
            self.update_task(name="Computing", progress=50)
            return 42

    svc = ProgressQuery(store)
    sender, sender_impl = make_sender()
    # noinspection PyTypeChecker
    result = await svc._rs_invoke_query(
        "slow_query",
        [],
        {},
        call_id="x",
        task_id="y",
        sender=sender,
    )
    assert result == 42
    await asyncio.sleep(0)
    sender_impl.assert_called_once()
    sender_impl.assert_awaited_once()
    msg: TaskUpdateMessage = sender_impl.call_args[0][0]
    assert isinstance(msg, TaskUpdateMessage)
    assert msg.method == "slow_query"
    assert msg.task_id == "y"
    assert msg.status == "running"
    assert msg.name == "Computing"
    assert msg.progress == 50.0
