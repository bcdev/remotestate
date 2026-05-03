from __future__ import annotations

import socket
import threading
import time
import webbrowser
from typing import Any

import uvicorn
from fastapi import FastAPI

from fastapi.staticfiles import StaticFiles
from starlette.staticfiles import PathLike

from .server import Server
from .service import Service
from .log import LOG


# Imported at module level so tests can patch zwieback.show._get_ipython.
try:
    # noinspection PyProtectedMember
    from IPython import get_ipython as _get_ipython
except ImportError:
    _get_ipython = None  # type: ignore[assignment]


DEFAULT_HOST = "localhost"
DEFAULT_PORT = 9753
DEFAULT_IFRAME_HEIGHT = 400

_servers: dict[str, uvicorn.Server] = {}


def serve(
    service: Service,
    *,
    ui_dist: PathLike | StaticFiles | None = None,
    mounts: dict[str, PathLike | StaticFiles] | None = None,
    app: FastAPI | None = None,
    open_browser: bool | None = None,
    open_iframe: bool | None = None,
    iframe_height: int = DEFAULT_IFRAME_HEIGHT,
    # --- Uvicorn
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    **uvicorn_settings: Any,
) -> Any:
    """Start the zwieback server and display the UI.

    Args:
        service: The PythonService instance to serve.
        ui_dist: Path of a directory which provides
            the HTML UI to be served.
            Typically, it contains a file "index.html".
            If given, will be served from root, i.e., "/".
        mounts: Mapping of an endpoint path to either a
            `fastapi.staticfiles.StaticFiles` object or a directory path.
        app: A FastAPI instance to use. If not provided,
            a new instance is created and passed to `Service.init_app(app)`
            so that it can by initialized by the user.
        open_browser: Open the UI in the default browser after starting.
            Defaults to True when not running in Jupyter.
        open_iframe: Render the UI as an IFrame in the Jupyter notebook.
            Defaults to True when running in Jupyter.
        iframe_height: Height of the IFrame in pixels.
        host: Host to bind the server to.
        port: Port to bind the server to.
        uvicorn_settings: Additional [uvicorn settings]((https://uvicorn.dev/settings/)
            to pass to the underlying
            [uvicorn server](https://uvicorn.dev/#config-and-server-instances).
    """
    in_jupyter = _in_jupyter()
    should_open_browser = open_browser if open_browser is not None else not in_jupyter
    should_open_iframe = open_iframe if open_iframe is not None else in_jupyter

    registry_key = _get_cell_id() or str(port)

    if registry_key in _servers:
        _stop_server(_servers[registry_key])
        _wait_for_port_free(host, port)

    # noinspection HttpUrlsUsage
    ui_dist_url_default = f"http://{host}:{port}"
    ui_dist_url: str | None = None
    mounts_ = dict(mounts) if mounts else {}
    if isinstance(ui_dist, StaticFiles):
        mounts_["/"] = ui_dist
    elif isinstance(ui_dist, str):
        if ui_dist.startswith("http://") or ui_dist.startswith("https://"):
            ui_dist_url = ui_dist
        else:
            mounts_["/"] = StaticFiles(directory=ui_dist, html=True)

    zwieback_server = Server(service=service, mounts=mounts_, app=app)

    uvicorn_settings.update(host=host, port=port)
    uvicorn_config = uvicorn.Config(zwieback_server.app, **uvicorn_settings)
    uvicorn_server = uvicorn.Server(uvicorn_config)
    _servers[registry_key] = uvicorn_server

    thread = threading.Thread(target=uvicorn_server.run, daemon=True)
    thread.start()

    # wait until we are ready to serve
    while not uvicorn_server.started:
        time.sleep(0.05)

    if ui_dist_url is None:
        ui_dist_url = ui_dist_url_default
        LOG.info(f"Serving UI from {ui_dist_url}")
    else:
        LOG.info(f"UI is coming from {ui_dist_url}")
    assert ui_dist_url is not None

    ui_dist_url += f"?t={int(time.time())}&ws=ws://{host}:{port}/ws"

    if should_open_iframe:
        from IPython.display import IFrame, display

        display(IFrame(src=ui_dist_url, width="100%", height=iframe_height))
    elif should_open_browser:
        webbrowser.open(ui_dist_url)


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
