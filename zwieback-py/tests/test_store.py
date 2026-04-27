from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

# noinspection PyProtectedMember
from zwieback.store import Store, _batch_pending_updates

# --- Fixtures ---


class Address(BaseModel):
    city: str
    street: str


class User(BaseModel):
    name: str
    age: int
    address: Address


@pytest.fixture
def simple_store():
    return Store(
        {
            "user": {"name": "Norman", "age": 42},
            "items": [{"id": 0, "label": "foo"}, {"id": 1, "label": "bar"}],
            "count": 0,
        }
    )


@pytest.fixture
def pydantic_store():
    return Store(
        {
            "user": User(
                name="Norman",
                age=42,
                address=Address(city="Hamburg", street="Reeperbahn"),
            ),
            "items": [],
        }
    )


# --- get ---


def test_get_simple(simple_store):
    assert simple_store.get("user.name") == "Norman"


def test_get_index(simple_store):
    assert simple_store.get("items[0].label") == "foo"


def test_get_missing_no_require(simple_store):
    assert simple_store.get("user.missing") is None


def test_get_missing_require(simple_store):
    with pytest.raises(KeyError):
        simple_store.get("user.missing", require=True)


def test_get_index_out_of_bounds_no_require(simple_store):
    assert simple_store.get("items[99]") is None


def test_get_index_out_of_bounds_require(simple_store):
    with pytest.raises(IndexError):
        simple_store.get("items[99]", require=True)


def test_get_pydantic(pydantic_store):
    assert pydantic_store.get("user.name") == "Norman"


def test_get_pydantic_nested(pydantic_store):
    assert pydantic_store.get("user.address.city") == "Hamburg"


def test_get_pydantic_missing_no_require(pydantic_store):
    assert pydantic_store.get("user.missing") is None


def test_get_pydantic_missing_require(pydantic_store):
    with pytest.raises(AttributeError):
        pydantic_store.get("user.missing", require=True)


# --- set ---


def test_set_simple(simple_store):
    simple_store.set("user.name", "Klaus")
    assert simple_store.get("user.name") == "Klaus"


def test_set_index(simple_store):
    simple_store.set("items[1].label", "baz")
    assert simple_store.get("items[1].label") == "baz"


def test_set_pydantic(pydantic_store):
    pydantic_store.set("user.name", "Klaus")
    assert pydantic_store.get("user.name") == "Klaus"


def test_set_pydantic_nested(pydantic_store):
    pydantic_store.set("user.address.city", "Berlin")
    assert pydantic_store.get("user.address.city") == "Berlin"


# --- subscribe / notify ---


def test_subscribe_called_on_set(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    simple_store.set("count", 1)
    cb.assert_called_once()


def test_subscribe_updates_contain_prefixes(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    simple_store.set("items[0].label", "new")
    updates = cb.call_args[0][0]
    assert "items[0].label" in updates
    assert "items[0]" in updates
    assert "items" in updates


def test_unsubscribe(simple_store):
    cb = MagicMock()
    unsubscribe = simple_store.subscribe(cb)
    unsubscribe()
    simple_store.set("count", 1)
    cb.assert_not_called()


def test_multiple_subscribers(simple_store):
    cb1, cb2 = MagicMock(), MagicMock()
    simple_store.subscribe(cb1)
    simple_store.subscribe(cb2)
    simple_store.set("count", 1)
    cb1.assert_called_once()
    cb2.assert_called_once()


# --- batch ---


def test_batch_single_notify(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    with _batch_pending_updates() as pending:
        simple_store.set("user.name", "Klaus")
        simple_store.set("count", 99)
        assert cb.call_count == 0  # no notify yet
    simple_store._flush(pending)
    assert cb.call_count == 1  # exactly once


def test_batch_contains_all_updates(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    with _batch_pending_updates() as pending:
        simple_store.set("user.name", "Klaus")
        simple_store.set("count", 99)
    simple_store._flush(pending)
    updates = cb.call_args[0][0]
    assert "user.name" in updates
    assert "user" in updates
    assert "count" in updates


def test_batch_values_are_serialized(pydantic_store):
    cb = MagicMock()
    pydantic_store.subscribe(cb)
    with _batch_pending_updates() as pending:
        pydantic_store.set("user.name", "Klaus")
    pydantic_store._flush(pending)
    updates = cb.call_args[0][0]
    # Pydantic-Object must be serialized as dict
    assert isinstance(updates["user"], dict)
    assert updates["user"]["name"] == "Klaus"


def test_store_set_raises_in_readonly_context(simple_store, readonly_ctx):
    with pytest.raises(PermissionError):
        simple_store.set("count", 1)


def test_store_get_allowed_in_readonly_context(simple_store, readonly_ctx):
    assert simple_store.get("count") == 0


def test_store_set_allowed_after_context_reset(simple_store):
    from .conftest import readonly_context

    with readonly_context():
        pass
    simple_store.set("count", 1)
    assert simple_store.get("count") == 1
