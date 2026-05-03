from abc import ABC, abstractmethod

from .protocol import OutgoingMessage


class Transport(ABC):
    @abstractmethod
    async def send(self, msg: OutgoingMessage) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...
