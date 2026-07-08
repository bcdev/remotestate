import pytest

import remotestate as rs
from remotestate.path import (
    format_path,
    from_jsonpath,
    normalize_path,
    normalize_path_segment,
    parse_path,
    prefixes,
    to_jsonpath,
)


def test_parse_path_parses_dotted_and_indexed_paths():
    assert parse_path("items[1].label") == ("items", 1, "label")


def test_parse_path_parses_bracketed_string_keys():
    assert parse_path('user["display name"]') == ("user", "display name")
    assert parse_path("user['display name']") == ("user", "display name")
    assert parse_path('user["0"]') == ("user", "0")
    assert parse_path("user['0']") == ("user", "0")
    assert parse_path('items[""].label') == ("items", "", "label")
    assert parse_path('user["weird.key"].value') == ("user", "weird.key", "value")
    assert parse_path('user[""]') == ("user", "")


def test_parse_path_parses_bracketed_string_key_escapes():
    assert parse_path('user["line\\nbreak"]') == ("user", "line\nbreak")
    assert parse_path('user["tab\\tseparated"]') == ("user", "tab\tseparated")
    assert parse_path('user["quote\\"slash\\\\"]') == ("user", 'quote"slash\\')
    assert parse_path("user['double\\\"quote']") == ("user", 'double"quote')
    assert parse_path('user["emoji \\uD83D\\uDE00"]') == (
        "user",
        "emoji " + chr(0x1F600),
    )


def test_parse_path_parses_a_single_root_segment():
    assert parse_path("count") == ("count",)


def test_parse_path_parses_the_empty_root_path():
    assert parse_path("") == ()


def test_parse_path_parses_root_bracket_segments():
    assert parse_path("[0].label") == (0, "label")
    assert parse_path('["display name"].value') == ("display name", "value")


def test_parse_path_throws_on_invalid_trailing_input():
    with pytest.raises(ValueError):
        parse_path("items..label")
    with pytest.raises(ValueError):
        parse_path("user.")
    with pytest.raises(ValueError):
        parse_path("items[*]")


def test_parse_path_throws_on_invalid_path_starts():
    with pytest.raises(ValueError):
        parse_path("1items")
    with pytest.raises(ValueError):
        parse_path(".items")


def test_parse_path_throws_on_non_canonical_integer_syntax():
    with pytest.raises(ValueError):
        parse_path("items[01]")
    with pytest.raises(ValueError):
        parse_path("items[foo]")


def test_format_path_formats_dotted_and_indexed_paths():
    assert format_path(("items", 1, "label")) == "items[1].label"


def test_format_path_formats_bracketed_string_keys_canonically():
    assert format_path(("user", "display name")) == 'user["display name"]'
    assert format_path(("user", "0")) == 'user["0"]'
    assert format_path(("items", "", "label")) == 'items[""].label'
    assert format_path(("user", "weird.key", "value")) == 'user["weird.key"].value'
    assert format_path(("items", "")) == 'items[""]'


def test_format_path_formats_a_single_root_segment():
    assert format_path(("count",)) == "count"


def test_format_path_formats_the_empty_root_path():
    assert format_path(()) == ""


def test_format_path_formats_root_bracket_segments():
    assert format_path((0, "label")) == "[0].label"
    assert format_path(("display name", "value")) == '["display name"].value'


def test_normalize_path_normalizes_dotted_strings_into_parsed_paths():
    assert normalize_path("items[1].label") == ("items", 1, "label")


def test_normalize_path_accepts_an_already_parsed_path_input_value():
    path = ("items", 1, "label")

    assert normalize_path(path) == path


def test_normalize_path_accepts_parsed_relative_paths():
    parsed = parse_path("items[1].label")

    assert normalize_path(parsed) == ("items", 1, "label")


def test_normalize_path_accepts_string_keys_in_array_form():
    assert normalize_path(("items", "display name")) == ("items", "display name")
    assert normalize_path(("items", "")) == ("items", "")


def test_normalize_path_accepts_empty_root_paths():
    assert normalize_path(()) == ()
    assert normalize_path("") == ()


def test_normalize_path_accepts_root_index_and_string_key_paths():
    assert normalize_path((1, "label")) == (1, "label")
    assert normalize_path(("", "label")) == ("", "label")


def test_normalize_path_segment_accepts_raw_segment_values():
    assert normalize_path_segment("items") == "items"
    assert normalize_path_segment(1) == 1


def test_normalize_path_rejects_invalid_array_form_path_segments():
    with pytest.raises(TypeError):
        normalize_path(("items", 1.5))
    with pytest.raises(ValueError):
        normalize_path(("items", -1, "label"))
    with pytest.raises(ValueError):
        normalize_path(("items", True, "label"))


def test_normalize_path_rejects_invalid_string_syntax():
    with pytest.raises(ValueError):
        normalize_path("items..label")
    with pytest.raises(ValueError):
        normalize_path("items[01]")


def test_normalize_path_rejects_bare_root_index_input():
    with pytest.raises(TypeError):
        normalize_path(0)  # type: ignore[arg-type]


def test_prefixes_returns_non_root_prefixes():
    assert [format_path(p) for p in prefixes(parse_path("user.name"))] == [
        "user",
        "user.name",
    ]
    assert [format_path(p) for p in prefixes(parse_path("items[3].name"))] == [
        "items",
        "items[3]",
        "items[3].name",
    ]
    assert prefixes(parse_path("user")) == [("user",)]
    assert prefixes(parse_path("")) == []


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
    assert rs.path.parse_path("user") == ("user",)
    assert not hasattr(rs.path, "Property")
    assert not hasattr(rs.path, "Index")
    assert not hasattr(rs, "Property")
    assert not hasattr(rs, "Index")
