import functools
import json
import re
from collections.abc import Sequence


# A single segment in a RemoteState path.
type PathSegment = str | int

# A parsed RemoteState path.
type Path = tuple[PathSegment, ...]

# A raw value accepted as one path segment.
type PathSegmentInput = str | int

# A raw value accepted anywhere a RemoteState path is needed.
type PathInput = str | Sequence[PathSegmentInput]

_IDENTIFIER_RE = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]*")
_INVALID_PATH_MESSAGE = "RemoteState paths must be valid simplified JSONPath paths"
_STRING_ESCAPES = {
    '"': '"',
    "'": "'",
    "\\": "\\",
    "/": "/",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
}


def normalize_path(path: PathInput) -> Path:
    """Normalize a path input value into a validated RemoteState path.

    Args:
        path: RemoteState path string or a sequence of path segment inputs
            such as ``("items", 0, "label")``.

    Returns:
        Parsed path.

    Raises:
        TypeError: If ``path`` is not a supported path input value.
        ValueError: If ``path`` contains an invalid segment.
    """
    if isinstance(path, str):
        return parse_path(path)
    if isinstance(path, Sequence):
        return tuple(normalize_path_segment(segment) for segment in path)
    raise TypeError("RemoteState path must be a string or sequence of path segments")


def normalize_path_segment(segment: PathSegmentInput) -> PathSegment:
    """Normalize one path segment input value into a validated path segment.

    Args:
        segment: A string property name or integer index.

    Returns:
        Parsed path segment.

    Raises:
        TypeError: If ``segment`` is not a supported path segment input value.
        ValueError: If an integer index is negative.
    """
    if isinstance(segment, bool):
        raise ValueError("RemoteState path indices must be non-negative integers")
    if isinstance(segment, int):
        _validate_index(segment)
        return segment
    if isinstance(segment, str):
        return segment
    raise TypeError("RemoteState path segments must be strings or integers")


@functools.cache
def parse_path(path: str) -> Path:
    """Parse a RemoteState path string.

    RemoteState paths use a strict subset of JSONPath without the ``"$."``
    prefix:

    - an empty path addresses the root state value
    - the first segment may be an identifier, bracketed integer index, or
      bracketed JSON string key
    - later segments may be dotted identifiers, bracketed integer indices, or
      bracketed JSON string keys
    - identifiers must match ``[a-zA-Z_][a-zA-Z0-9_]*``
    - integer indices must be non-negative integers without leading zeroes
    - string keys use JSON string literal syntax and may use either ``'`` or
      ``"``
    - the whole string must match the grammar; prefix parsing is not allowed

    Examples:

    - ``""``
    - ``"user"``
    - ``"[0].label"``
    - ``"items[0].label"``
    - ``"[\"display name\"]"``
    - ``"user[\"display name\"]"``

    Args:
        path: Path string such as ``"user.name"``, ``"items[0].label"``, or
            ``"user[\"display name\"]"``.

    Returns:
        Parsed path.

    Raises:
        ValueError: If ``path`` is not a valid RemoteState path.
    """
    if path == "":
        return ()

    first = _read_identifier(path, 0)
    if first is not None:
        segments: list[PathSegment] = [first[0]]
        pos = first[1]
    elif path[0] == "[":
        bracket = _read_bracket_segment(path, 0)
        if bracket is None:
            raise _invalid_path(path)
        segments = [bracket[0]]
        pos = bracket[1]
    else:
        raise _invalid_path(path)

    while pos < len(path):
        match path[pos]:
            case ".":
                pos += 1
                identifier = _read_identifier(path, pos)
                if identifier is None:
                    raise _invalid_path(path, pos)
                segments.append(identifier[0])
                pos = identifier[1]
            case "[":
                bracket = _read_bracket_segment(path, pos)
                if bracket is None:
                    raise _invalid_path(path, pos)
                segments.append(bracket[0])
                pos = bracket[1]
            case _:
                raise _invalid_path(path, pos)

    return tuple(segments)


def format_path(path: Path) -> str:
    """Convert parsed RemoteState path segments back to dotted/bracket syntax.

    Args:
        path: Parsed path.

    Returns:
        The canonical string form used by the transport and cache keys.
    """
    _validate_path(path)
    parts: list[str] = []
    for index, segment in enumerate(path):
        if isinstance(segment, int):
            parts.append(f"[{segment}]")
        elif index == 0 and _IDENTIFIER_RE.fullmatch(segment):
            parts.append(segment)
        elif _IDENTIFIER_RE.fullmatch(segment):
            parts.append(f".{segment}")
        else:
            parts.append(f"[{json.dumps(segment, ensure_ascii=False)}]")
    return "".join(parts)


def prefixes(path: Path) -> list[Path]:
    """Return all non-root prefixes of a parsed path.

    Args:
        path: Parsed path.

    Returns:
        Prefix paths ordered from shortest to longest. The root path ``()`` has
        no non-root prefixes.
    """
    return [path[:i] for i in range(1, len(path) + 1)]


def to_jsonpath(path: str) -> str:
    """Convert a RemoteState path to a simple JSONPath string.

    Args:
        path: RemoteState path string.

    Returns:
        JSONPath string for the same location.
    """
    if path == "":
        return "$"
    if path.startswith("["):
        return f"${path}"
    return f"$.{path}"


def from_jsonpath(path: str) -> str:
    """Convert a simple JSONPath string to a RemoteState path.

    Args:
        path: JSONPath string that is ``"$"``, starts with ``"$."``, or starts
            with ``"$["``.

    Returns:
        RemoteState path string.

    Raises:
        ValueError: If ``path`` is not a supported simple JSONPath string.
    """
    if path == "$":
        return ""
    if path.startswith("$["):
        return path[1:]
    if not path.startswith("$."):
        raise ValueError(f"Not a JSONPath: {path!r}")
    return path[2:]


def _validate_path(path: Path) -> None:
    for segment in path:
        if isinstance(segment, bool):
            raise ValueError(_INVALID_PATH_MESSAGE)
        if isinstance(segment, int):
            _validate_index(segment)
        elif not isinstance(segment, str):
            raise ValueError(_INVALID_PATH_MESSAGE)


def _validate_index(index: int) -> None:
    if index < 0:
        raise ValueError("RemoteState path indices must be non-negative integers")


def _read_identifier(path: str, start: int) -> tuple[str, int] | None:
    if start >= len(path):
        return None
    if not _is_identifier_start(path[start]):
        return None
    pos = start + 1
    while pos < len(path) and _is_identifier_part(path[pos]):
        pos += 1
    return path[start:pos], pos


def _read_bracket_segment(path: str, start: int) -> tuple[PathSegment, int] | None:
    if start >= len(path) or path[start] != "[":
        return None
    if start + 1 >= len(path):
        return None

    next_char = path[start + 1]
    if next_char in {'"', "'"}:
        parsed = _read_quoted_string_literal(path, start + 1)
        if parsed is None:
            return None
        key, pos = parsed
        if pos >= len(path) or path[pos] != "]":
            return None
        return key, pos + 1

    if not _is_digit(next_char):
        return None

    pos = start + 1
    while pos < len(path) and _is_digit(path[pos]):
        pos += 1
    digits = path[start + 1 : pos]
    if len(digits) > 1 and digits.startswith("0"):
        return None
    if pos >= len(path) or path[pos] != "]":
        return None
    return int(digits), pos + 1


def _read_quoted_string_literal(path: str, start: int) -> tuple[str, int] | None:
    if start >= len(path) or path[start] not in {'"', "'"}:
        return None

    quote = path[start]
    value: list[str] = []
    pos = start + 1
    while pos < len(path):
        char = path[pos]
        if char == quote:
            return "".join(value), pos + 1
        if char != "\\":
            if ord(char) < 0x20:
                return None
            value.append(char)
            pos += 1
            continue
        pos += 1
        if pos >= len(path):
            return None
        escape = path[pos]
        escaped = _STRING_ESCAPES.get(escape)
        if escaped is not None:
            value.append(escaped)
            pos += 1
            continue
        if escape == "u":
            parsed = _read_unicode_code_unit(path, pos + 1)
            if parsed is None:
                return None
            code_unit, pos = parsed
            if 0xD800 <= code_unit <= 0xDBFF:
                if pos + 6 > len(path) or path[pos] != "\\" or path[pos + 1] != "u":
                    return None
                low = _read_unicode_code_unit(path, pos + 2)
                if low is None:
                    return None
                low_unit, pos = low
                if not 0xDC00 <= low_unit <= 0xDFFF:
                    return None
                code_point = (
                    0x10000 + ((code_unit - 0xD800) << 10) + (low_unit - 0xDC00)
                )
                value.append(chr(code_point))
                continue
            if 0xDC00 <= code_unit <= 0xDFFF:
                return None
            value.append(chr(code_unit))
            continue
        return None
    return None


def _read_unicode_code_unit(path: str, start: int) -> tuple[int, int] | None:
    if start + 4 > len(path):
        return None
    hex_digits = path[start : start + 4]
    if not all(_is_hex_digit(char) for char in hex_digits):
        return None
    return int(hex_digits, 16), start + 4


def _is_identifier_start(char: str) -> bool:
    code = ord(char)
    return char == "_" or 0x41 <= code <= 0x5A or 0x61 <= code <= 0x7A


def _is_identifier_part(char: str) -> bool:
    return _is_identifier_start(char) or _is_digit(char)


def _is_digit(char: str) -> bool:
    return "0" <= char <= "9"


def _is_hex_digit(char: str) -> bool:
    code = ord(char)
    return 0x30 <= code <= 0x39 or 0x41 <= code <= 0x46 or 0x61 <= code <= 0x66


def _invalid_path(path: str, pos: int | None = None) -> ValueError:
    if pos is None:
        return ValueError(f"{_INVALID_PATH_MESSAGE}: {path!r}")
    return ValueError(f"{_INVALID_PATH_MESSAGE} at position {pos}: {path!r}")
