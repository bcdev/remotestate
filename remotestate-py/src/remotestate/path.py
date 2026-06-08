import functools
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Property:
    key: str


@dataclass(frozen=True)
class Index:
    i: int


type PathSegment = Property | Index
type Path = tuple[PathSegment, ...]

# noinspection RegExpRedundantEscape
_SEGMENT_RE = re.compile(r"\.([a-zA-Z_][a-zA-Z0-9_]*)|\[(\d+)\]")


@functools.cache
def parse_path(path: str) -> Path:
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
    """Get prefix-paths for invalidation."""
    return [path[:i] for i in range(1, len(path) + 1)]


def path_to_str(path: Path) -> str:
    parts: list[str] = []
    for seg in path:
        match seg:
            case Property(key):
                parts.append(f".{key}" if parts else key)
            case Index(i):
                parts.append(f"[{i}]")
    return "".join(parts)


def to_jsonpath(path: str) -> str:
    return f"$.{path}"


def from_jsonpath(path: str) -> str:
    if not path.startswith("$."):
        raise ValueError(f"Not a JSONPath: {path!r}")
    return path[2:]
