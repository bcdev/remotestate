# tests/show_test.py
import socket
import threading
import time
from urllib.parse import parse_qs, urlsplit
from unittest.mock import MagicMock, patch

import pytest

# noinspection PyProtectedMember
from remotestate.serve import (
    _add_ui_url_params,
    _get_cell_id,
    _in_jupyter,
    _wait_for_port_free,
)

# --- _in_jupyter ---


def test_in_jupyter_returns_true_when_ipython_active():
    mock_ip = MagicMock()
    with patch("remotestate.serve._get_ipython", return_value=mock_ip):
        assert _in_jupyter() is True


def test_in_jupyter_returns_false_when_no_ipython():
    with patch("remotestate.serve._get_ipython", return_value=None):
        assert _in_jupyter() is False


def test_in_jupyter_returns_false_on_exception():
    with patch("remotestate.serve._get_ipython", side_effect=RuntimeError("oops")):
        assert _in_jupyter() is False


# --- _get_cell_id ---


def test_get_cell_id_returns_id_when_in_jupyter():
    mock_ip = MagicMock()
    mock_ip.get_parent.return_value = {"metadata": {"cellId": "abc-123"}}
    with patch("remotestate.serve._get_ipython", return_value=mock_ip):
        assert _get_cell_id() == "abc-123"


def test_get_cell_id_returns_none_when_no_cell_id():
    mock_ip = MagicMock()
    mock_ip.get_parent.return_value = {"metadata": {}}
    with patch("remotestate.serve._get_ipython", return_value=mock_ip):
        assert _get_cell_id() is None


def test_get_cell_id_returns_none_when_not_in_jupyter():
    with patch("remotestate.serve._get_ipython", return_value=None):
        assert _get_cell_id() is None


def test_get_cell_id_returns_none_on_exception():
    mock_ip = MagicMock()
    mock_ip.get_parent.side_effect = RuntimeError("oops")
    with patch("remotestate.serve._get_ipython", return_value=mock_ip):
        assert _get_cell_id() is None


# --- _add_ui_url_params ---


def test_add_ui_url_params_preserves_existing_query_and_fragment():
    with patch("remotestate.serve.time.time", return_value=123.9):
        url = _add_ui_url_params(
            "http://localhost:5173/app?mode=dev#view",
            host="localhost",
            port=9753,
        )

    url_parts = urlsplit(url)
    assert url_parts.fragment == "view"
    assert parse_qs(url_parts.query) == {
        "mode": ["dev"],
        "t": ["123"],
        "ws": ["ws://localhost:9753/ws"],
    }
    assert url.index("?") < url.index("#")


def test_add_ui_url_params_replaces_existing_runtime_params():
    with patch("remotestate.serve.time.time", return_value=456.1):
        url = _add_ui_url_params(
            "http://localhost:5173/?t=old&ws=old&mode=dev",
            host="127.0.0.1",
            port=9754,
        )

    assert parse_qs(urlsplit(url).query) == {
        "mode": ["dev"],
        "t": ["456"],
        "ws": ["ws://127.0.0.1:9754/ws"],
    }


# --- _wait_for_port_free ---


def test_wait_for_port_free_returns_immediately_if_port_is_free():
    _wait_for_port_free("localhost", 19999, timeout=1.0)


def test_wait_for_port_free_waits_until_port_is_free():
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # No SO_REUSEADDR
    server_sock.bind(("localhost", 19998))
    server_sock.listen(1)

    def release():
        time.sleep(0.2)
        server_sock.close()

    threading.Thread(target=release, daemon=True).start()
    _wait_for_port_free("localhost", 19998, timeout=2.0)


def test_wait_for_port_free_raises_on_timeout():
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # No SO_REUSEADDR here — we want bind() to fail in _wait_for_port_free
    server_sock.bind(("localhost", 19997))
    server_sock.listen(1)

    try:
        with pytest.raises(TimeoutError):
            _wait_for_port_free("localhost", 19997, timeout=0.2)
    finally:
        server_sock.close()
