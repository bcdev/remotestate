import { StoreImpl } from "./store";
import { ServiceImpl, type QueryOptions } from "./service";
import { TransportImpl } from "./transport";
import { createRemoteTaskStore, TaskController } from "./tasks";
import type { RemoteStateClient, RemoteStateClientOptions } from "./client";
import { type MethodArgs, type QueryMethod, type QueryResult } from "./types";

/**
 * Create a Remote State client bound to one websocket endpoint.
 *
 * @typeParam S The type that defines the available service methods.
 * @param url The websocket endpoint URL.
 * @param options Client options.
 * @returns A `RemoteStateClient` connected to the given endpoint.
 */
export function createRemoteStateClient<S = unknown>(
  url: string,
  options: RemoteStateClientOptions = {},
): RemoteStateClient<S> {
  const transport = new TransportImpl(coerceUrl(url));
  const store = new StoreImpl(transport);
  const taskStore = options.taskStore ?? createRemoteTaskStore();
  const ownsTaskStore = options.taskStore === undefined;
  const taskController = new TaskController(taskStore, transport);
  const service = new ServiceImpl(transport, taskController);

  return {
    store,
    tasks: taskStore,

    action: (method, args = [] as never, kwargs = {}, options = {}) =>
      service.action(method as string, args, kwargs, options),

    query: <M extends QueryMethod<S>>(
      method: M,
      args: MethodArgs<S, M> = [] as never,
      kwargs: Record<string, unknown> = {},
      options: QueryOptions = {},
    ) =>
      service.query(method as string, args, kwargs, options) as Promise<
        QueryResult<S, M>
      >,

    dispose: () => {
      store.dispose();
      taskController.dispose();
      if (ownsTaskStore && taskStore.dispose) {
        taskStore.dispose();
      }
      transport.close();
    },
  };
}

function coerceUrl(url: string): string {
  const explicitUrl = url.trim();
  if (!explicitUrl) {
    throw new Error("createRemoteStateClient requires a non-empty URL");
  }

  return normalizeWebSocketUrl(explicitUrl);
}

function normalizeWebSocketUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const parsedUrl = new URL(url);
    parsedUrl.protocol = parsedUrl.protocol === "https:" ? "wss:" : "ws:";
    parsedUrl.pathname = "/ws";
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString();
  }

  return url;
}
