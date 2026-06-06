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

    it("omits action task_id when taskId option is not provided", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.action("increment");

      expect(transport.send).toHaveBeenCalledWith(
        expect.not.objectContaining({ task_id: expect.any(String) }),
      );
    });

    it("uses provided taskId option as action task_id", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.action("increment", [], {}, { taskId: "counter-task" });

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: "counter-task" }),
      );
    });

    it("does not track action tasks without task_id", () => {
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

    it("waits for action_result when awaitInvalidate is true", async () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      const promise = service.action(
        "increment",
        [],
        {},
        { awaitInvalidate: true },
      );
      const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };

      transport._triggerMessage({
        type: "action_result",
        call_id: sentMsg.call_id,
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
      const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };

      transport._triggerMessage({
        type: "error",
        call_id: sentMsg.call_id,
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

    it("omits query taskId when taskId option is not provided", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.query("compute", [5.0]);

      expect(transport.send).toHaveBeenCalledWith(
        expect.not.objectContaining({ task_id: expect.any(String) }),
      );
    });

    it("uses provided taskId option as query taskId", () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      void service.query("compute", [5.0], {}, { taskId: "compute-task" });

      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: "compute-task" }),
      );
    });

    it("does not track query tasks without taskId option", () => {
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
      const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };

      transport._triggerMessage({
        type: "query_result",
        call_id: sentMsg.call_id,
        value: 15.0,
      });

      await expect(promise).resolves.toBe(15.0);
    });

    it("rejects on error message", async () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      const promise = service.query("compute", [5.0]);
      const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };

      transport._triggerMessage({
        type: "error",
        call_id: sentMsg.call_id,
        message: "oops",
      });

      await expect(promise).rejects.toThrow("oops");
    });

    it("ignores messages with different call_id", async () => {
      const transport = mockTransportWithHandler();
      const service = new ServiceImpl(asTransport(transport));

      const promise = service.query("compute", [5.0]);

      transport._triggerMessage({
        type: "query_result",
        call_id: "i_am_not_ok",
        value: 999,
      });

      const sentMsg = transport.send.mock.calls[0][0] as { call_id: string };
      transport._triggerMessage({
        type: "query_result",
        call_id: sentMsg.call_id,
        value: 15.0,
      });

      await expect(promise).resolves.toBe(15.0);
    });
  });
});
