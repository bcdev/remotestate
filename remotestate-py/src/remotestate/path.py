import functools
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Property:
    """A named property segment in a RemoteState path.

    Args:
        key: Property name.
    """

    key: str


@dataclass(frozen=True)
class Index:
    """A list index segment in a RemoteState path.

    Args:
        i: Zero-based list index.
    """

    i: int


# One parsed path segment.
type PathSegment = Property | Index

# A parsed RemoteState path.
type Path = tuple[PathSegment, ...]

# noinspection RegExpRedundantEscape
_SEGMENT_RE = re.compile(r"\.([a-zA-Z_][a-zA-Z0-9_]*)|\[(\d+)\]")


@functools.cache
def parse_path(path: str) -> Path:
    """Parse a RemoteState path string.

    Args:
        path: Path string such as ``"user.name"`` or ``"items[0].label"``.

    Returns:
        Parsed path segments.

    Raises:
        ValueError: If ``path`` is not a valid RemoteState path.
    """
    segments: list[PathSegment] = []

    # first segment: "user.name" starts without "."
    first = re.match(r"[a-zA-Z_][a-zA-Z0-9_]*", path)
    if not first or first.start() != 0:
        raise ValueError(f"Invalid path: {path!r}")
    segments.append(Property(first.group()))
    pos = first.end()

    for m in _SEGMENT_RE.finditer(path, pos):
        if m.start() != pos:
            raise ValueError(f"Invalid path at position {pos}: {path!r}")
        if m.group(1) is not None:
            segments.append(Property(m.group(1)))
        else:
            segments.append(Index(int(m.group(2))))
        pos = m.end()

    if pos != len(path):
        raise ValueError(f"Invalid path at position {pos}: {path!r}")

    return tuple(segments)


def prefixes(path: Path) -> list[Path]:
    """Return all non-empty prefixes of a parsed path.

    Args:
        path: Parsed path.

    Returns:
        Prefix paths ordered from shortest to longest.
    """
    return [path[:i] for i in range(1, len(path) + 1)]


def path_to_str(path: Path) -> str:
    """Convert a parsed path back to a RemoteState path string.

    Args:
        path: Parsed path.

    Returns:
        String representation of ``path``.
    """
    parts: list[str] = []
    for seg in path:
        match seg:
            case Property(key):
                parts.append(f".{key}" if parts else key)
            case Index(i):
                parts.append(f"[{i}]")
    return "".join(parts)


def to_jsonpath(path: str) -> str:
    """Convert a RemoteState path to a simple JSONPath string.

    Args:
        path: RemoteState path string.

    Returns:
        JSONPath string for the same location.
    """
    return f"$.{path}"


def from_jsonpath(path: str) -> str:
    """Convert a simple JSONPath string to a RemoteState path.

    Args:
        path: JSONPath string that starts with ``"$."``.

    Returns:
        RemoteState path string.

    Raises:
        ValueError: If ``path`` does not start with ``"$."``.
    """
    if not path.startswith("$."):
        raise ValueError(f"Not a JSONPath: {path!r}")
    return path[2:]
