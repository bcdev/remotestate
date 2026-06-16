from abc import ABC, abstractmethod

from .protocol import OutgoingMessage


class Transport(ABC):
    """Abstract transport used by the server to send messages to clients."""

    @abstractmethod
    async def send(self, msg: OutgoingMessage) -> None:
        """Send one message to a connected client.

        Args:
            msg: Protocol message to send.

        Returns:
            None.
        """

    @abstractmethod
    async def close(self) -> None:
        """Close the transport and release its resources.

        Returns:
            None.
        """
