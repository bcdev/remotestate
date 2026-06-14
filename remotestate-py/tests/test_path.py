import remotestate as rs
import pytest

from remotestate.path import (
    Index,
    Property,
    from_jsonpath,
    parse_path,
    path_to_str,
    prefixes,
    to_jsonpath,
)

# --- parse_path ---


def test_simple_property():
    assert parse_path("user") == (Property("user"),)


def test_nested_properties():
    assert parse_path("user.name") == (Property("user"), Property("name"))


def test_index():
    assert parse_path("items[3]") == (Property("items"), Index(3))


def test_nested_after_index():
    assert parse_path("items[3].name") == (
        Property("items"),
        Index(3),
        Property("name"),
    )


def test_deep():
    assert parse_path("a.b[0].c[1].d") == (
        Property("a"),
        Property("b"),
        Index(0),
        Property("c"),
        Index(1),
        Property("d"),
    )


def test_underscore_in_key():
    assert parse_path("my_field.sub_field") == (
        Property("my_field"),
        Property("sub_field"),
    )


def test_invalid_starts_with_dot():
    with pytest.raises(ValueError):
        parse_path(".user")


def test_invalid_starts_with_index():
    with pytest.raises(ValueError):
        parse_path("[0].name")


def test_invalid_empty():
    with pytest.raises(ValueError):
        parse_path("")


def test_invalid_trailing_dot():
    with pytest.raises(ValueError):
        parse_path("user.")


def test_invalid_double_dot():
    with pytest.raises(ValueError):
        parse_path("user..name")


def test_invalid_non_integer_index():
    with pytest.raises(ValueError):
        parse_path("items[foo]")


def test_invalid_jsonpath_wildcard():
    with pytest.raises(ValueError):
        parse_path("items[*]")


# --- prefixes ---


def test_prefixes_simple():
    path = parse_path("user.name")
    result = [path_to_str(p) for p in prefixes(path)]
    assert result == ["user", "user.name"]


def test_prefixes_with_index():
    path = parse_path("items[3].name")
    result = [path_to_str(p) for p in prefixes(path)]
    assert result == ["items", "items[3]", "items[3].name"]


def test_prefixes_single():
    path = parse_path("user")
    result = prefixes(path)
    assert len(result) == 1


# --- path_to_str ---


def test_roundtrip_simple():
    assert path_to_str(parse_path("user.name")) == "user.name"


def test_roundtrip_index():
    assert path_to_str(parse_path("items[3].name")) == "items[3].name"


def test_roundtrip_deep():
    s = "a.b[0].c[1].d"
    assert path_to_str(parse_path(s)) == s


# --- jsonpath ---


def test_to_jsonpath():
    assert to_jsonpath("user.name") == "$.user.name"


def test_from_jsonpath():
    assert from_jsonpath("$.user.name") == "user.name"


def test_from_jsonpath_invalid():
    with pytest.raises(ValueError):
        from_jsonpath("user.name")


def test_path_namespace_is_exported_from_package_root():
    assert rs.path.Property("user") == Property("user")
    assert rs.path.Index(3) == Index(3)
    assert not hasattr(rs, "Property")
    assert not hasattr(rs, "Index")
