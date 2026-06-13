export { createRemoteStateClient } from "./client";
export { createRemoteTaskStore, TaskStoreImpl } from "./tasks";
export type { RemoteStateClient, RemoteStateClientOptions } from "./client";
export type {
  IncomingMessage,
  OutgoingMessage,
  TaskUpdateMessage,
} from "./protocol";
export type { ActionOptions, QueryOptions } from "./service";
export type { Store, Service } from "./types";
export type {
  TaskState,
  TaskStatus,
  TaskStore,
  WritableTaskStore,
} from "./tasks";

// TODO: consider a dedicated package remotestate-react
export {
  useRemoteStateClient,
  useRemoteStore,
  useRemoteStateValue,
  useRemoteState,
  useRemoteTask,
  useRemoteTaskStore,
  useRemoteTasks,
} from "./react/hooks";
export { RemoteStateProvider } from "./react/provider";
