import { describe, expect, it, vi } from "vitest";
import { TaskController, TaskStoreImpl, createRemoteTaskStore } from "../lib/tasks";
import { asTransport, mockTransportWithHandler } from "./mocks";

describe("TaskStoreImpl", () => {
  it("returns undefined for unknown tasks", () => {
    const store = new TaskStoreImpl();

    expect(store.getTask("missing")).toBeUndefined();
    expect(store.getAllTasks()).toEqual([]);
  });

  it("stores tasks and notifies listeners", () => {
    const store = createRemoteTaskStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
      status: "running",
      startedAt: 1,
      updatedAt: 1,
    });

    expect(store.getTask("export")).toMatchObject({
      method: "export_report",
      status: "running",
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("TaskController", () => {
  it("starts a task", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));

    controller.startTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
    });

    expect(store.getTask("export")).toMatchObject({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
      status: "running",
    });
  });

  it("applies update_task messages", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));
    controller.startTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
    });

    transport._triggerMessage({
      type: "update_task",
      call_id: "call-1",
      task_id: "export",
      method: "export_report",
      status: "running",
      name: "Rendering",
      detail: "Page 2",
      progress: 40,
    });

    expect(store.getTask("export")).toMatchObject({
      name: "Rendering",
      detail: "Page 2",
      progress: 40,
      status: "running",
    });
  });

  it("ignores update_task messages for untracked calls", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    new TaskController(store, asTransport(transport));

    transport._triggerMessage({
      type: "update_task",
      call_id: "call-1",
      task_id: "export",
      method: "export_report",
      status: "running",
      progress: 40,
    });

    expect(store.getAllTasks()).toEqual([]);
  });

  it("marks actions done on action_result", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));
    controller.startTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "call-1",
      updates: { result: "ok" },
    });

    expect(store.getTask("export")).toMatchObject({
      status: "done",
      progress: 100,
    });
  });

  it("marks queries done on query_result", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));
    controller.startTask({
      callId: "call-1",
      taskId: "compute",
      method: "compute",
    });

    transport._triggerMessage({
      type: "query_result",
      call_id: "call-1",
      value: 42,
    });

    expect(store.getTask("compute")).toMatchObject({
      status: "done",
      progress: 100,
    });
  });

  it("marks tasks failed on error", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));
    controller.startTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
    });

    transport._triggerMessage({
      type: "error",
      call_id: "call-1",
      message: "boom",
    });

    expect(store.getTask("export")).toMatchObject({
      status: "error",
      error: "boom",
    });
  });

  it("ignores stale completions for reused task IDs", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));
    controller.startTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
    });
    controller.startTask({
      callId: "call-2",
      taskId: "export",
      method: "export_report",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "call-1",
      updates: {},
    });

    expect(store.getTask("export")).toMatchObject({
      callId: "call-2",
      status: "running",
    });
  });

  it("ignores late running updates after completion", () => {
    const transport = mockTransportWithHandler();
    const store = new TaskStoreImpl();
    const controller = new TaskController(store, asTransport(transport));
    controller.startTask({
      callId: "call-1",
      taskId: "export",
      method: "export_report",
    });

    transport._triggerMessage({
      type: "action_result",
      call_id: "call-1",
      updates: {},
    });
    transport._triggerMessage({
      type: "update_task",
      call_id: "call-1",
      taskId: "export",
      method: "export_report",
      status: "running",
      progress: 20,
    });

    expect(store.getTask("export")).toMatchObject({
      status: "done",
      progress: 100,
    });
  });
});
