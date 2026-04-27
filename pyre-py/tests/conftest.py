import contextlib
from typing import Awaitable, Callable
from unittest.mock import AsyncMock

import pytest

# noinspection PyProtectedMember
from pyre.context import _call_context, _CallContext
from pyre.protocol import TaskUpdateMessage


def make_sender(
    sender_impl: AsyncMock | None = None,
) -> tuple[Callable[[TaskUpdateMessage], Awaitable[None]], AsyncMock]:
    sender_impl: AsyncMock = sender_impl or AsyncMock()

    async def sender(msg: TaskUpdateMessage) -> None:
        # noinspection PyUnresolvedReferences
        await sender_impl(msg)

    return sender, sender_impl


@contextlib.contextmanager
def readonly_context():
    """Sets a readonly _CallContext for testing store permission checks."""

    sender, _ = make_sender()
    token = _call_context.set(
        _CallContext(
            call_id="x",
            task_id="y",
            method="test",
            sender=sender,
            readonly=True,
        )
    )
    try:
        yield
    finally:
        _call_context.reset(token)


@pytest.fixture
def readonly_ctx():
    """Pytest fixture wrapping readonly_context for use in test functions."""
    with readonly_context():
        yield
