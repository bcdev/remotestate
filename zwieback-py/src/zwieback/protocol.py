from typing import Any, Literal, Annotated

from pydantic import BaseModel, Field

# ----------------------------------------------------
# JS --> Python
# ----------------------------------------------------


class GetMessage(BaseModel):
    """Request one store value by path."""

    type: Literal["get"] = "get"
    """Message type."""

    call_id: str
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

    call_id: str
    """An internal action-ID."""

    task_id: str | None = None
    """User-supplied task identifier for status and progress tracking."""

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

    call_id: str
    """An internal query-ID."""

    task_id: str | None = None
    """User-supplied task identifier for status and progress tracking."""

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

    call_id: str
    """An internal get-ID."""

    path: str
    """Path into store's state using a simplified JSON-Path format."""

    value: Any
    """The JSON value of the state value."""


class ActionResultMessage(BaseModel):
    """Return the batched store updates produced by a previous ``ActionMessage``."""

    type: Literal["action_result"] = "action_result"
    """Message type."""

    call_id: str
    """An internal action- or query-ID."""

    updates: dict[str, Any]
    """Mapping from state paths to changed state values. May be empty."""


class QueryResultMessage(BaseModel):
    """Return the computed result for a previous ``QueryMessage``."""

    type: Literal["query_result"] = "query_result"
    """Message type."""

    call_id: str
    """An internal query-ID."""

    value: Any
    """The query result."""


class TaskUpdateMessage(BaseModel):
    """Report task progress for a tracked action or query.

    These messages are only emitted when the caller supplied a task ID.
    """

    type: Literal["update_task"] = "update_task"
    """Message type."""

    call_id: str
    """An internal action- or query-ID."""

    task_id: str
    """User-supplied task identifier."""

    method: str
    """The method name."""

    status: Literal["running", "done", "error"]
    """Task status."""

    name: str | None = None
    """Task name."""

    detail: str | None = None
    """Task detail text."""

    progress: float | None = Field(None, ge=0, le=100)
    """Task progress, a number between 0 and 100."""

    error: str | None = None
    """Error message. Valid only if status is `"error"`."""


class ErrorMessage(BaseModel):
    """Return an error for a previous action, query, or parse failure."""

    type: Literal["error"] = "error"
    """Message type."""

    call_id: str
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
    | ActionResultMessage
    | ErrorMessage,
    Field(discriminator="type"),
]
"""Any message that can be sent from Python back to JavaScript."""
