# tests/show_test.py
import socket
import threading
import time
from unittest.mock import MagicMock, patch

import pytest

from zwieback.show import _get_cell_id, _in_jupyter, _wait_for_port_free

# --- _in_jupyter ---


def test_in_jupyter_returns_true_when_ipython_active():
    mock_ip = MagicMock()
    with patch("zwieback.show._get_ipython", return_value=mock_ip):
        assert _in_jupyter() is True


def test_in_jupyter_returns_false_when_no_ipython():
    with patch("zwieback.show._get_ipython", return_value=None):
        assert _in_jupyter() is False


def test_in_jupyter_returns_false_on_exception():
    with patch("zwieback.show._get_ipython", side_effect=RuntimeError("oops")):
        assert _in_jupyter() is False


# --- _get_cell_id ---


def test_get_cell_id_returns_id_when_in_jupyter():
    mock_ip = MagicMock()
    mock_ip.get_parent.return_value = {"metadata": {"cellId": "abc-123"}}
    with patch("zwieback.show._get_ipython", return_value=mock_ip):
        assert _get_cell_id() == "abc-123"


def test_get_cell_id_returns_none_when_no_cell_id():
    mock_ip = MagicMock()
    mock_ip.get_parent.return_value = {"metadata": {}}
    with patch("zwieback.show._get_ipython", return_value=mock_ip):
        assert _get_cell_id() is None


def test_get_cell_id_returns_none_when_not_in_jupyter():
    with patch("zwieback.show._get_ipython", return_value=None):
        assert _get_cell_id() is None


def test_get_cell_id_returns_none_on_exception():
    mock_ip = MagicMock()
    mock_ip.get_parent.side_effect = RuntimeError("oops")
    with patch("zwieback.show._get_ipython", return_value=mock_ip):
        assert _get_cell_id() is None


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
