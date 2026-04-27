import { describe, it, expect } from "vitest";
import { PyreService } from "../lib/service";
import { mockTransportWithHandler, asTransport } from "./mocks";

describe("PyreService", () => {
  describe("action", () => {
    it("sends action message", () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      void service.action("increment");

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "action", method: "increment" }),
      );
    });

    it("resolves immediately without awaitInvalidate", async () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      await expect(service.action("increment")).resolves.toBeUndefined();
    });

    it("waits for invalidate when awaitInvalidate is true", async () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      const promise = service.action(
        "increment",
        [],
        {},
        { awaitInvalidate: true },
      );
      const sentMsg = transport.send.mock.calls[0][0] as { id: string };

      transport._trigger({
        type: "invalidate",
        id: sentMsg.id,
        updates: { count: 1 },
      });

      await expect(promise).resolves.toBeUndefined();
    });

    it("rejects on error message", async () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      const promise = service.action(
        "increment",
        [],
        {},
        { awaitInvalidate: true },
      );
      const sentMsg = transport.send.mock.calls[0][0] as { id: string };

      transport._trigger({
        type: "error",
        id: sentMsg.id,
        message: "oops",
      });

      await expect(promise).rejects.toThrow("oops");
    });
  });

  describe("query", () => {
    it("sends query message", () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      void service.query("compute", [5.0]);

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "query", method: "compute" }),
      );
    });

    it("resolves with query_result value", async () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      const promise = service.query("compute", [5.0]);
      const sentMsg = transport.send.mock.calls[0][0] as { id: string };

      transport._trigger({
        type: "query_result",
        id: sentMsg.id,
        value: 15.0,
      });

      await expect(promise).resolves.toBe(15.0);
    });

    it("rejects on error message", async () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      const promise = service.query("compute", [5.0]);
      const sentMsg = transport.send.mock.calls[0][0] as { id: string };

      transport._trigger({
        type: "error",
        id: sentMsg.id,
        message: "oops",
      });

      await expect(promise).rejects.toThrow("oops");
    });

    it("ignores messages with different id", async () => {
      const transport = mockTransportWithHandler();
      const service = new PyreService(asTransport(transport));

      const promise = service.query("compute", [5.0]);

      transport._trigger({
        type: "query_result",
        id: "wrong-id",
        value: 999,
      });

      const sentMsg = transport.send.mock.calls[0][0] as { id: string };
      transport._trigger({
        type: "query_result",
        id: sentMsg.id,
        value: 15.0,
      });

      await expect(promise).resolves.toBe(15.0);
    });
  });
});
