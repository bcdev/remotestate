import remotestate as rs
import pytest

from remotestate.path import (
    Index,
    Property,
    from_jsonpath,
    format_path,
    normalize_path,
    normalize_path_segment,
    parse_path,
    prefixes,
    to_jsonpath,
)

# --- parse_path ---


def test_simple_property():
    assert parse_path("user") == (Property("user"),)


def test_empty_path_is_root():
    assert parse_path("") == ()


def test_nested_properties():
    assert parse_path("user.name") == (Property("user"), Property("name"))


def test_index():
    assert parse_path("items[3]") == (Property("items"), Index(3))


def test_root_index():
    assert parse_path("[3].name") == (Index(3), Property("name"))


def test_string_key():
    assert parse_path('user["display name"]') == (
        Property("user"),
        Property("display name"),
    )
    assert parse_path("user['display name']") == (
        Property("user"),
        Property("display name"),
    )
    assert parse_path('user["0"]') == (Property("user"), Property("0"))
    assert parse_path("user['0']") == (Property("user"), Property("0"))
    assert parse_path('items[""].label') == (
        Property("items"),
        Property(""),
        Property("label"),
    )


def test_string_key_escapes():
    assert parse_path('user["line\\nbreak"]') == (
        Property("user"),
        Property("line\nbreak"),
    )
    assert parse_path('user["tab\\tseparated"]') == (
        Property("user"),
        Property("tab\tseparated"),
    )
    assert parse_path('user["quote\\"slash\\\\"]') == (
        Property("user"),
        Property('quote"slash\\'),
    )
    assert parse_path("user['double\\\"quote']") == (
        Property("user"),
        Property('double"quote'),
    )
    assert parse_path('user["emoji \\uD83D\\uDE00"]') == (
        Property("user"),
        Property("emoji " + chr(0x1F600)),
    )


def test_root_string_key():
    assert parse_path('["root"]') == (Property("root"),)
    assert parse_path('["display name"].value') == (
        Property("display name"),
        Property("value"),
    )


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


def test_allows_root_index():
    assert parse_path("[0].name") == (Index(0), Property("name"))


def test_allows_root_string_key():
    assert parse_path('["root"]') == (Property("root"),)


def test_allows_empty_root():
    assert parse_path("") == ()


def test_invalid_trailing_dot():
    with pytest.raises(ValueError):
        parse_path("user.")


def test_invalid_double_dot():
    with pytest.raises(ValueError):
        parse_path("user..name")


def test_invalid_non_integer_index():
    with pytest.raises(ValueError):
        parse_path("items[foo]")


def test_invalid_leading_zero_index():
    with pytest.raises(ValueError):
        parse_path("items[01]")


def test_invalid_jsonpath_wildcard():
    with pytest.raises(ValueError):
        parse_path("items[*]")


# --- normalize_path ---


def test_normalize_path_accepts_strings():
    assert normalize_path("items[0].label") == (
        Property("items"),
        Index(0),
        Property("label"),
    )


def test_normalize_path_accepts_segment_sequences():
    assert normalize_path(("items", 0, "label")) == (
        Property("items"),
        Index(0),
        Property("label"),
    )


def test_normalize_path_accepts_bare_root_index():
    assert normalize_path(0) == (Index(0),)


def test_normalize_path_segment_accepts_raw_segments():
    assert normalize_path_segment("items") == Property("items")
    assert normalize_path_segment(0) == Index(0)


def test_normalize_path_rejects_invalid_segments():
    with pytest.raises(ValueError):
        normalize_path(("items", -1))


# --- prefixes ---


def test_prefixes_simple():
    path = parse_path("user.name")
    result = [format_path(p) for p in prefixes(path)]
    assert result == ["user", "user.name"]


def test_prefixes_with_index():
    path = parse_path("items[3].name")
    result = [format_path(p) for p in prefixes(path)]
    assert result == ["items", "items[3]", "items[3].name"]


def test_prefixes_single():
    path = parse_path("user")
    result = prefixes(path)
    assert len(result) == 1


def test_prefixes_root():
    assert prefixes(parse_path("")) == []


# --- format_path ---


def test_roundtrip_simple():
    assert format_path(parse_path("user.name")) == "user.name"


def test_roundtrip_root():
    assert format_path(parse_path("")) == ""


def test_roundtrip_index():
    assert format_path(parse_path("items[3].name")) == "items[3].name"
    assert format_path(parse_path("[3].name")) == "[3].name"


def test_roundtrip_string_key():
    assert format_path(parse_path('user["display name"]')) == 'user["display name"]'
    assert format_path(parse_path("user['display name']")) == 'user["display name"]'
    assert format_path(parse_path('user["0"]')) == 'user["0"]'
    assert format_path(parse_path("user['0']")) == 'user["0"]'
    assert format_path(parse_path('items[""].label')) == 'items[""].label'
    assert format_path(parse_path('["display name"].value')) == (
        '["display name"].value'
    )


def test_roundtrip_deep():
    s = "a.b[0].c[1].d"
    assert format_path(parse_path(s)) == s


def test_roundtrip_empty_string_key():
    assert format_path(parse_path('user[""]')) == 'user[""]'


# --- jsonpath ---


def test_to_jsonpath():
    assert to_jsonpath("user.name") == "$.user.name"
    assert to_jsonpath("") == "$"
    assert to_jsonpath("[0].name") == "$[0].name"


def test_from_jsonpath():
    assert from_jsonpath("$.user.name") == "user.name"
    assert from_jsonpath("$") == ""
    assert from_jsonpath("$[0].name") == "[0].name"


def test_from_jsonpath_invalid():
    with pytest.raises(ValueError):
        from_jsonpath("user.name")


def test_path_namespace_is_exported_from_package_root():
    assert rs.path.Property("user") == Property("user")
    assert rs.path.Index(3) == Index(3)
    assert not hasattr(rs, "Property")
    assert not hasattr(rs, "Index")
