import json

from pydantic import TypeAdapter

from remotestate.protocol import (
    IncomingMessage,
    GetMessage,
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
