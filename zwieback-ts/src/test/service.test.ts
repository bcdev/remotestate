import { describe, it, expect } from "vitest";
import { ServiceImpl } from "../lib/service";
import { mockTransportWithHandler, asTransport } from "./mocks";
import { TaskController, TaskStoreImpl } from "../lib/tasks";

describe("ServiceImpl", () => {
  describe("action", () => {
    it("sends action message", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.action("increment");

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "action", method: "increment" }),
      );
    });

    it("omits action tid when taskId is not provided", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.action("increment");

      expect(transport.send).toHaveBeenCalledWith(
        expect.not.objectContaining({ tid: expect.any(String) }),
      );
    });

    it("uses provided taskId as action tid", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.action("increment", [], {}, { taskId: "counter-task" });

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ tid: "counter-task" }),
      );
    });

    it("does not track action tasks without taskId", () => {
      const transport = mockTransportWithHandler();
      const taskStore = new TaskStoreImpl();
      const taskController = new TaskController(
        taskStore,
        asTransport(transport),
      );
      const service = new ServiceImpl(asTransport(transport), taskController);

      void service.action("increment");

      expect(taskStore.getAllTasks()).toEqual([]);
    });

    it("resolves immediately without awaitInvalidate", async () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      await expect(service.action("increment")).resolves.toBeUndefined();
    });

    it("waits for invalidate when awaitInvalidate is true", async () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

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
      const service = new ServiceImpl(asTransport(transport));

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
      const service = new ServiceImpl(asTransport(transport));

      void service.query("compute", [5.0]);

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "query", method: "compute" }),
      );
    });

    it("omits query tid when taskId is not provided", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.query("compute", [5.0]);

      expect(transport.send).toHaveBeenCalledWith(
        expect.not.objectContaining({ tid: expect.any(String) }),
      );
    });

    it("uses provided taskId as query tid", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.query("compute", [5.0], {}, { taskId: "compute-task" });

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ tid: "compute-task" }),
      );
    });

    it("does not track query tasks without taskId", () => {
      const transport = mockTransportWithHandler();
      const taskStore = new TaskStoreImpl();
      const taskController = new TaskController(
        taskStore,
        asTransport(transport),
      );
      const service = new ServiceImpl(asTransport(transport), taskController);

      void service.query("compute", [5.0]);

      expect(taskStore.getAllTasks()).toEqual([]);
    });

    it("resolves with query_result value", async () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

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
      const service = new ServiceImpl(asTransport(transport));

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
      const service = new ServiceImpl(asTransport(transport));

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
