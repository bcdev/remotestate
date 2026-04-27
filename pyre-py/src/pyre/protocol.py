from typing import Any, Literal, Annotated

from pydantic import BaseModel, Field

# ----------------------------------------------------
# JS --> Python
# ----------------------------------------------------


class GetMessage(BaseModel):
    type: Literal["get"] = "get"
    """Message type."""

    id: str
    """The internal get-ID."""

    path: str
    """The modification path (simple JSON-Path)"""


class ActionMessage(BaseModel):
    type: Literal["action"] = "action"
    """Message type."""

    id: str
    """The internal action-ID."""

    tid: str
    """User-supplied or auto-generated task identifier."""

    method: str
    """The action method's name."""

    args: list[Any] = []
    """The action method's positional arguments."""

    kwargs: dict[str, Any] = {}
    """The action method's keyword arguments."""


class QueryMessage(BaseModel):
    type: Literal["query"] = "query"
    """Message type."""

    id: str
    """The internal query-ID."""

    tid: str
    """User-supplied or auto-generated task identifier."""

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
    type: Literal["get_result"] = "get_result"
    """Message type."""

    id: str
    """The internal get-ID."""

    path: str
    value: Any


class QueryResultMessage(BaseModel):
    type: Literal["query_result"] = "query_result"
    """Message type."""

    id: str
    """The internal query-ID."""

    value: Any
    """The query result."""


class TaskUpdateMessage(BaseModel):
    type: Literal["task_update"] = "task_update"
    """Message type."""

    id: str
    """The internal action- or query-ID."""

    tid: str
    """User-supplied or auto-generated task identifier."""

    method: str
    """The method name."""

    status: Literal["running", "done", "error"]
    name: str | None = None
    detail: str | None = None
    progress: float | None = None  # 0-100
    error: str | None = None


class InvalidateMessage(BaseModel):
    type: Literal["invalidate"] = "invalidate"
    id: str
    updates: dict[str, Any]  # path --> value


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    id: str
    message: str


# ----------------------------------------------------
# Discriminated Unions for the Dispatcher
# ----------------------------------------------------

IncomingMessage = Annotated[
    GetMessage | ActionMessage | QueryMessage,
    Field(discriminator="type"),
]

OutgoingMessage = Annotated[
    GetResultMessage
    | QueryResultMessage
    | TaskUpdateMessage
    | InvalidateMessage
    | ErrorMessage,
    Field(discriminator="type"),
]
