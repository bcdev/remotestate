from typing import Any, Literal, Annotated

from pydantic import BaseModel, Field

# ----------------------------------------------------
# JS --> Python
# ----------------------------------------------------


class GetMessage(BaseModel):
    """Request one store value by path."""

    type: Literal["get"] = "get"
    """Message type."""

    id: str
    """An internal get-ID."""

    path: str
    """The modification path using a simplified JSON-Path format."""


class ActionMessage(BaseModel):
    """Invoke a service action.

    This is fire-and-forget from the caller's perspective. A matching
    ``InvalidateMessage`` carries the resulting state changes.
    """

    type: Literal["action"] = "action"
    """Message type."""

    id: str
    """An internal action-ID."""

    tid: str | None = None
    """User-supplied task identifier for progress tracking."""

    method: str
    """The action method's name."""

    args: list[Any] = []
    """The action method's positional arguments."""

    kwargs: dict[str, Any] = {}
    """The action method's keyword arguments."""


class QueryMessage(BaseModel):
    """Invoke a read-only service query.

    Queries return a value via ``QueryResultMessage`` and may optionally carry
    a task ID when the caller wants progress updates.
    """

    type: Literal["query"] = "query"
    """Message type."""

    id: str
    """An internal query-ID."""

    tid: str | None = None
    """User-supplied task identifier for progress tracking."""

    method: str
    """The query method's name."""

    args: list[Any] = []
    """The query method's positional arguments."""

    kwargs: dict[str, Any] = {}
    """The query method's keyword arguments."""


# ----------------------------------------------------
# Python --> JS
# ----------------------------------------------------


class GetResultMessage(BaseModel):
    """Return the current value for a previous ``GetMessage``."""

    type: Literal["get_result"] = "get_result"
    """Message type."""

    id: str
    """An internal get-ID."""

    path: str
    """Path into store's state using a simplified JSON-Path format."""

    value: Any
    """The JSON value of the state value."""


class QueryResultMessage(BaseModel):
    """Return the computed result for a previous ``QueryMessage``."""

    type: Literal["query_result"] = "query_result"
    """Message type."""

    id: str
    """An internal query-ID."""

    value: Any
    """The query result."""


class TaskUpdateMessage(BaseModel):
    """Report task progress for a tracked action or query.

    These messages are only emitted when the caller supplied a task ID.
    """

    type: Literal["task_update"] = "task_update"
    """Message type."""

    id: str
    """An internal action- or query-ID."""

    tid: str
    """User-supplied task identifier."""

    method: str
    """The method name."""

    status: Literal["running", "done", "error"]
    name: str | None = None
    detail: str | None = None
    progress: float | None = None  # 0-100
    error: str | None = None


class InvalidateMessage(BaseModel):
    """Return the batched store updates produced by an action."""

    type: Literal["invalidate"] = "invalidate"
    """Message type."""

    id: str
    """An internal action- or query-ID."""

    updates: dict[str, Any]
    """Mapping from state paths to changed state values."""


class ErrorMessage(BaseModel):
    """Return an error for a previous action, query, or parse failure."""

    type: Literal["error"] = "error"
    """Message type."""

    id: str
    """An internal action- or query-ID."""

    message: str
    """Error message text."""


# ----------------------------------------------------
# Discriminated Unions for the Dispatcher
# ----------------------------------------------------

IncomingMessage = Annotated[
    GetMessage | ActionMessage | QueryMessage,
    Field(discriminator="type"),
]
"""Any message that can be sent from JavaScript to Python."""

OutgoingMessage = Annotated[
    GetResultMessage
    | QueryResultMessage
    | TaskUpdateMessage
    | InvalidateMessage
    | ErrorMessage,
    Field(discriminator="type"),
]
"""Any message that can be sent from Python back to JavaScript."""
