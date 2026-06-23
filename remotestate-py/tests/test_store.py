from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

# noinspection PyProtectedMember
from remotestate.store import Store, _batch_pending_updates

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
            "items": [
                {"id": 0, "label": "foo"},
                {"id": 1, "label": "bar"},
            ],
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


def test_get_root_value(simple_store):
    assert simple_store.get() is simple_store.state
    assert simple_store.get("") is simple_store.state
    assert simple_store[()] is simple_store.state


def test_get_root_array_by_index():
    store = Store([{"label": "foo"}])

    assert store.get("[0].label") == "foo"
    assert store[0, "label"] == "foo"


def test_get_tuple_path_treats_string_as_single_segment():
    store = Store({"items.with.dot": "value"})

    assert store["items.with.dot",] == "value"
    assert store["items.with.dot"] is None


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


def test_set_root_value(simple_store):
    simple_store.set("", ["replacement"])

    assert simple_store.state == ["replacement"]
    assert simple_store.get("") == ["replacement"]


def test_set_root_value_with_empty_tuple(simple_store):
    simple_store[()] = {"count": 99}

    assert simple_store.state == {"count": 99}
    assert simple_store["count"] == 99


def test_set_tuple_path(simple_store):
    simple_store["items", 0, "label"] = "x"

    assert simple_store["items[0].label"] == "x"


def test_set_root_array_by_index():
    store = Store([{"label": "foo"}])

    store[0, "label"] = "x"

    assert store.state == [{"label": "x"}]


def test_set_index(simple_store):
    simple_store.set("items[1].label", "baz")
    assert simple_store.get("items[1].label") == "baz"


def test_set_with_at_accessor(simple_store):
    simple_store.at.items[0].label = "x"

    assert simple_store.get("items[0].label") == "x"


def test_set_with_at_accessor_item_keys():
    store = Store({"items.with.dot": {"get": "old"}})

    store.at["items.with.dot"].get = "new"

    assert store["items.with.dot", "get"] == "new"


def test_set_with_at_accessor_notifies_exact_path(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)

    simple_store.at.items[0].label = "new"

    updates = cb.call_args[0][0]
    assert updates == {("items", 0, "label"): "new"}


def test_at_accessor_repr_shows_value(simple_store):
    assert repr(simple_store.at.items[0].label) == "'foo'"


def test_at_accessor_pretty_repr_shows_value(simple_store):
    printer = MagicMock()

    simple_store.at.items[0].label._repr_pretty_(printer, cycle=False)

    printer.pretty.assert_called_once_with("foo")


def test_at_accessor_html_repr_shows_escaped_value():
    store = Store({"value": "<tag>"})

    assert store.at.value._repr_html_() == "<pre>&#x27;&lt;tag&gt;&#x27;</pre>"


def test_set_pydantic(pydantic_store):
    pydantic_store.set("user.name", "Klaus")
    assert pydantic_store.get("user.name") == "Klaus"


def test_set_pydantic_nested(pydantic_store):
    pydantic_store.set("user.address.city", "Berlin")
    assert pydantic_store.get("user.address.city") == "Berlin"


def test_set_missing_parent_without_default_factory_raises(simple_store):
    with pytest.raises(KeyError):
        simple_store.set("profile.name", "Norman")


def test_set_creates_missing_dict_parents_with_default_factory():
    store = Store({}, default_factory=lambda _path: {})

    store.set("user.address.city", "Hamburg")

    assert store.get("user") == {"address": {"city": "Hamburg"}}


def test_set_default_factory_receives_missing_prefix_paths():
    calls = []

    def factory(path):
        calls.append(path)
        return {}

    store = Store({}, default_factory=factory)

    store.set("user.address.city", "Hamburg")

    assert calls == [
        ("user",),
        ("user", "address"),
    ]


def test_set_default_factory_receives_root_index_paths():
    calls = []

    def factory(path):
        calls.append(path)
        return {}

    store = Store([], default_factory=factory)

    store.set("[0].label", "foo")

    assert calls == [(0,)]
    assert store.state == [{"label": "foo"}]


def test_set_default_factory_can_create_pydantic_objects():
    def factory(path):
        if path == ("user",):
            return User(
                name="",
                age=0,
                address=Address(city="", street=""),
            )
        return {}

    store = Store({}, default_factory=factory)

    store.set("user.address.city", "Berlin")

    assert isinstance(store.get("user"), User)
    assert store.get("user.address.city") == "Berlin"


def test_set_default_factory_can_create_list_items():
    def factory(path):
        if path == ("items",):
            return []
        return {}

    store = Store({}, default_factory=factory)

    store.set("items[0].label", "foo")

    assert store.get("items") == [{"label": "foo"}]


def test_set_list_leaf_still_raises_without_default_factory():
    store = Store({"items": []})

    with pytest.raises(IndexError):
        store.set("items[0]", {"label": "foo"})


def test_set_list_leaf_can_append_with_default_factory():
    store = Store({"items": []}, default_factory=lambda _path: {})

    store.set("items[0]", {"label": "foo"})

    assert store.get("items") == [{"label": "foo"}]


def test_set_sparse_list_index_raises_with_default_factory():
    calls = []

    def factory(path):
        calls.append(path)
        if path == ("items",):
            return []
        return {}

    store = Store({}, default_factory=factory)

    with pytest.raises(IndexError):
        store.set("items[1].label", "foo")

    assert calls == [("items",)]


def test_get_never_calls_default_factory():
    factory = MagicMock(return_value={})
    store = Store({}, default_factory=factory)

    assert store.get("user.name") is None
    factory.assert_not_called()


# --- subscribe / notify ---


def test_subscribe_called_on_set(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    simple_store.set("count", 1)
    cb.assert_called_once()


def test_subscribe_updates_contain_exact_path_only(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    simple_store.set("items[0].label", "new")
    updates = cb.call_args[0][0]
    assert updates == {("items", 0, "label"): "new"}


def test_subscribe_root_update_uses_empty_path(simple_store):
    cb = MagicMock()
    simple_store.subscribe(cb)
    simple_store.set("", {"count": 1})
    updates = cb.call_args[0][0]
    assert updates == {(): {"count": 1}}


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


def test_multiple_changes(simple_store):
    changes = []

    def record_change(change):
        changes.append(change)

    simple_store.subscribe(record_change)
    simple_store.set("items[1].label", "Test 2")
    simple_store.set("items[0].label", "Test 1")

    assert changes == [
        {("items", 1, "label"): "Test 2"},
        {("items", 0, "label"): "Test 1"},
    ]


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
    assert ("user", "name") in updates
    assert ("count",) in updates
    assert ("user",) not in updates


def test_batch_leaf_values_are_serialized(pydantic_store):
    cb = MagicMock()
    pydantic_store.subscribe(cb)
    with _batch_pending_updates() as pending:
        pydantic_store.set("user.name", "Klaus")
    pydantic_store._flush(pending)
    updates = cb.call_args[0][0]
    assert updates == {("user", "name"): "Klaus"}


def test_batch_object_values_are_serialized(pydantic_store):
    cb = MagicMock()
    pydantic_store.subscribe(cb)
    user = User(
        name="Klaus",
        age=43,
        address=Address(city="Berlin", street="Unter den Linden"),
    )
    with _batch_pending_updates() as pending:
        pydantic_store.set("user", user)
    pydantic_store._flush(pending)
    updates = cb.call_args[0][0]
    assert isinstance(updates[("user",)], dict)
    assert updates[("user",)]["name"] == "Klaus"


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
