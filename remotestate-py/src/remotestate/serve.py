from __future__ import annotations

import socket
import threading
import time
import webbrowser
from collections.abc import Callable
from dataclasses import dataclass, field
from html import escape
from typing import Any, Literal, TypeGuard
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.staticfiles import PathLike

from .log import LOG
from .server import Server
from .service import Service

# Imported at module level so tests can patch remotestate.serve._get_ipython.
try:
    # noinspection PyProtectedMember
    from IPython import get_ipython as _get_ipython
except ImportError:
    _get_ipython = None  # type: ignore[assignment]


DEFAULT_HOST = "localhost"
DEFAULT_NOTEBOOK_WIDTH = "100%"
DEFAULT_NOTEBOOK_HEIGHT = 400

_servers: dict[str, _RunningServer] = {}

DisplayMode = Literal["auto", "browser", "notebook", "none"]


@dataclass
class ServeResult:
    """Result of starting a ``remotestate`` server."""

    host: str
    port: int
    server_url: str
    ws_url: str
    ui_base_url: str
    ui_url: str
    app: FastAPI
    server: uvicorn.Server
    thread: threading.Thread
    registry_key: str = field(repr=False)

    def stop(self, *, timeout: float = 5.0) -> None:
        """Stop the underlying server and wait until its port is free."""
        _stop_server(self.server)
        _wait_for_port_free(self.host, self.port, timeout=timeout)
        _servers.pop(self.registry_key, None)

    def _repr_html_(self) -> str:
        rows = [
            ("Host", self.host, False),
            ("Port", self.port, False),
            ("Server URL", self.server_url, True),
            ("WebSocket URL", self.ws_url, True),
            ("UI Base URL", self.ui_base_url, True),
            ("UI URL", self.ui_url, True),
        ]

        def format_value(value: object, is_url: bool) -> str:
            escaped = escape(str(value))
            if is_url:
                return f'<a href="{escaped}">{escaped}</a>'
            return escaped

        body = "".join(
            "<tr>"
            f"<th>{escape(label)}</th>"
            f"<td>{format_value(value, is_url)}</td>"
            "</tr>"
            for label, value, is_url in rows
        )
        return (
            "<table>"
            "<thead><tr><th>Field</th><th>Value</th></tr></thead>"
            f"<tbody>{body}</tbody>"
            "</table>"
        )


Display = DisplayMode | Callable[[ServeResult], None]


@dataclass
class _RunningServer:
    host: str
    port: int
    server: uvicorn.Server


def serve(
    service: Service,
    *,
    ui_dist: PathLike | StaticFiles | None = None,
    mounts: dict[str, PathLike | StaticFiles] | None = None,
    app: FastAPI | None = None,
    display: Display = "auto",
    width: int | str = DEFAULT_NOTEBOOK_WIDTH,
    height: int | str = DEFAULT_NOTEBOOK_HEIGHT,
    # --- Uvicorn
    host: str = DEFAULT_HOST,
    port: int | None = None,
    **uvicorn_settings: Any,
) -> ServeResult:
    """Start the ``remotestate`` web server and display the UI.

    Args:
        service: The PythonService instance to serve.
        ui_dist: Path of a directory which provides
            the HTML UI to be served.
            Typically, it contains a file "index.html".
            If given, will be served from root, i.e., "/".
        mounts: Mapping of an endpoint path to either a
            `fastapi.staticfiles.StaticFiles` object or a directory path.
        app: A FastAPI instance to use. If not provided,
            a new instance is created and passed to `Service._init_app(app)`
            so that it can be initialized by the user.
        display: Controls how the UI is shown after the server starts.
            Use "auto" to render inline in notebooks and open a browser
            otherwise, "browser", "notebook", "none", or a callback that accepts
            the returned `ServeResult`.
        width: Width of the notebook display.
        height: Height of the notebook display.
        host: Host to bind the server to.
        port: Port to bind the server to. Use 0 or None to choose a free port.
        uvicorn_settings: Additional uvicorn settings
            to pass to the underlying
            [uvicorn server](https://uvicorn.dev/#config-and-server-instances).

    Returns:
        A `ServeResult` with the server URL, WebSocket URL, UI URL, and
        underlying server handles.
    """
    port = _find_free_port(host) if port is None or port == 0 else port
    registry_key = _get_cell_id() or str(port)

    if registry_key in _servers:
        previous = _servers[registry_key]
        _stop_server(previous.server)
        _wait_for_port_free(previous.host, previous.port)

    # noinspection HttpUrlsUsage
    server_url = f"http://{host}:{port}"
    ws_url = f"ws://{host}:{port}/ws"
    mounts_, ui_base_url = _resolve_ui_dist(
        ui_dist,
        mounts=mounts,
        server_url=server_url,
    )

    rs_server = Server(service=service, mounts=mounts_, app=app)

    uvicorn_settings.update(host=host, port=port)
    if "log_config" not in uvicorn_settings:
        # disable uvicorn's default logging setup
        uvicorn_settings.update(log_config=_get_log_config())

    uvicorn_config = uvicorn.Config(rs_server.app, **uvicorn_settings)
    uvicorn_server = uvicorn.Server(uvicorn_config)
    _servers[registry_key] = _RunningServer(host, port, uvicorn_server)

    thread = threading.Thread(target=uvicorn_server.run, daemon=True)
    thread.start()

    # wait until we are ready to serve
    while not uvicorn_server.started:
        time.sleep(0.05)

    if ui_base_url == server_url:
        LOG.info(f"Serving UI from {ui_base_url}")
    else:
        LOG.info(f"UI is coming from {ui_base_url}")

    ui_url = _add_ui_url_params(ui_base_url, ws_url=ws_url)
    result = ServeResult(
        host=host,
        port=port,
        server_url=server_url,
        ws_url=ws_url,
        ui_base_url=ui_base_url,
        ui_url=ui_url,
        app=rs_server.app,
        server=uvicorn_server,
        thread=thread,
        registry_key=registry_key,
    )

    _display_result(
        result,
        display=display,
        width=width,
        height=height,
    )
    return result


def _resolve_ui_dist(
    ui_dist: PathLike | StaticFiles | None,
    *,
    mounts: dict[str, PathLike | StaticFiles] | None,
    server_url: str,
) -> tuple[dict[str, PathLike | StaticFiles], str]:
    mounts_ = dict(mounts) if mounts else {}
    ui_base_url = server_url
    if isinstance(ui_dist, StaticFiles):
        mounts_["/"] = ui_dist
    elif _is_http_url(ui_dist):
        ui_base_url = ui_dist
    elif ui_dist is not None:
        mounts_["/"] = StaticFiles(directory=ui_dist, html=True)
    return mounts_, ui_base_url


def _display_result(
    result: ServeResult,
    *,
    display: Display,
    width: int | str,
    height: int | str,
) -> None:
    if callable(display):
        display(result)
        return

    display_mode = _get_display_mode(display)

    if display_mode == "notebook":
        from IPython.display import IFrame
        from IPython.display import display as ipython_display

        ipython_display(IFrame(src=result.ui_url, width=width, height=height))
    elif display_mode == "browser":
        webbrowser.open(result.ui_url)


def _get_display_mode(display: DisplayMode) -> Literal["browser", "notebook", "none"]:
    if display == "auto":
        return "notebook" if _in_jupyter() else "browser"
    return display


def _get_cell_id() -> str | None:
    """Return the current Jupyter cell ID, or None if not in Jupyter."""
    # noinspection PyBroadException
    try:
        ip = _get_ipython()
        if ip is None:
            return None
        return ip.get_parent()["metadata"].get("cellId")
    except Exception:
        return None


def _in_jupyter() -> bool:
    # noinspection PyBroadException
    try:
        return _get_ipython() is not None
    except Exception:
        return False


def _add_ui_url_params(
    ui_dist_url: str,
    *,
    ws_url: str,
) -> str:
    """Add remotestate runtime parameters without breaking query or fragment parts."""
    url_parts = urlsplit(ui_dist_url)
    query = [
        (key, value)
        for key, value in parse_qsl(url_parts.query, keep_blank_values=True)
        if key not in {"t", "ws"}
    ]
    query.extend(
        [
            ("t", str(int(time.time()))),
            ("ws", ws_url),
        ]
    )
    # noinspection PyTypeChecker
    return urlunsplit(url_parts._replace(query=urlencode(query)))


def _find_free_port(host: str = DEFAULT_HOST) -> int:
    with socket.socket() as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _is_http_url(value: object) -> TypeGuard[str]:
    return isinstance(value, str) and (
        value.startswith("http://") or value.startswith("https://")
    )


def _stop_server(server: uvicorn.Server) -> None:
    """Signal a running uvicorn server to shut down."""
    server.should_exit = True


def _wait_for_port_free(host: str, port: int, timeout: float = 5.0) -> None:
    """Block until the port is no longer in use or timeout expires."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
                return  # bind succeeded → port is free
            except OSError:
                pass  # port still in use
        time.sleep(0.05)
    raise TimeoutError(f"Port {port} did not become free within {timeout}s")


def _get_log_config(log_file: str | PathLike = "server.log") -> dict[str, Any]:
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "handlers": {
            "file": {
                "class": "logging.FileHandler",
                "filename": str(log_file),
                "formatter": "default",
            }
        },
        "formatters": {
            "default": {
                "format": "%(asctime)s %(levelname)s %(name)s: %(message)s",
            }
        },
        "loggers": {
            "uvicorn": {"handlers": ["file"], "level": "INFO", "propagate": False},
            "uvicorn.error": {
                "handlers": ["file"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["file"],
                "level": "INFO",
                "propagate": False,
            },
        },
    }
