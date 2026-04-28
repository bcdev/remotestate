from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Awaitable

from zwieback.protocol import TaskUpdateMessage


@dataclass
class _CallContext:
    call_id: str
    task_id: str | None
    method: str
    sender: Callable[[TaskUpdateMessage], Awaitable[None]]
    readonly: bool = False


_call_context: ContextVar[_CallContext | None] = ContextVar(
    "_call_context", default=None
)
