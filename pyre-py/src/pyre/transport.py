from abc import ABC, abstractmethod

from pyre.protocol import OutgoingMessage


class PyreTransport(ABC):
    @abstractmethod
    async def send(self, msg: OutgoingMessage) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...
