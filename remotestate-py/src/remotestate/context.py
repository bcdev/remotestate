from collections.abc import Callable, Coroutine
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from .protocol import TaskUpdateMessage


@dataclass
class _CallContext:
    """Per-call execution context used during service dispatch.

    Attributes:
        call_id: Internal request ID used to correlate protocol messages.
        task_id: Optional user-supplied task ID for progress reporting.
        method: Name of the action or query being executed.
        sender: Coroutine used to emit task updates back to the transport.
        readonly: Whether store mutation must be rejected for this call.
    """

    call_id: str
    task_id: str | None
    method: str
    sender: Callable[[TaskUpdateMessage], Coroutine[Any, Any, None]]
    readonly: bool = False


_call_context: ContextVar[_CallContext | None] = ContextVar(
    "_call_context", default=None
)
"""Task-local context for the currently executing action or query."""

_suppress_store_broadcast: ContextVar[bool] = ContextVar(
    "_suppress_store_broadcast", default=False
)
"""Whether store subscribers should skip external transport broadcasts."""
