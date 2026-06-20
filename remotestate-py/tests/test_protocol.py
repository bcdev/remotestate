import json

from pydantic import TypeAdapter

from remotestate.protocol import (
    IncomingMessage,
    GetMessage,
    SetMessage,
    SetResultMessage,
    OutgoingMessage,
    ActionMessage,
)

_incoming_adapter = TypeAdapter(IncomingMessage)
_outgoing_adapter = TypeAdapter(OutgoingMessage)


def to_json(**properties):
    return json.dumps(properties)


def test_get():
    assert _incoming_adapter.validate_json(
        to_json(type="get", call_id="x", path="y")
    ) == GetMessage(call_id="x", path="y")


def test_set():
    assert _incoming_adapter.validate_json(
        to_json(type="set", call_id="x", path="count", value=7)
    ) == SetMessage(call_id="x", path="count", value=7)


def test_set_result():
    assert _outgoing_adapter.validate_python(
        {"type": "set_result", "call_id": "x", "updates": {"count": 7}}
    ) == SetResultMessage(call_id="x", updates={"count": 7})


def test_action():
    assert _incoming_adapter.validate_json(
        to_json(
            type="action",
            call_id="x",
            task_id="y",
            method="set_model",
            args=[],
            kwargs={},
        )
    ) == ActionMessage(call_id="x", task_id="y", method="set_model", args=[], kwargs={})


def test_action_without_task_id():
    assert _incoming_adapter.validate_json(
        to_json(type="action", call_id="x", method="set_model", args=[], kwargs={})
    ) == ActionMessage(call_id="x", method="set_model", args=[], kwargs={})
