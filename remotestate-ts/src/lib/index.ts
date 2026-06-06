export { createRemoteState, createClient } from "./client";
export { createTaskStore, TaskStoreImpl } from "./tasks";
export type {
  RemoteState,
  Client,
  RemoteStateOptions,
  ClientOptions,
} from "./client";
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
  useClient,
  useStore,
  useState,
  useStateValue,
  useTask,
  useTaskStore,
  useTasks,
} from "./react/hooks";
export { RemoteStateProvider, ClientProvider } from "./react/provider";


