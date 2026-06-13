import { StoreImpl } from "./store";
import { ServiceImpl, type ActionOptions, type QueryOptions } from "./service";
import { TransportImpl } from "./transport";
import { Store } from "./types";
import {
  createRemoteTaskStore,
  TaskController,
  type WritableTaskStore,
} from "./tasks";

type ReturnType<T> = T extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

type ActionKeys<S> = {
  [K in keyof S]: ReturnType<S[K]> extends undefined ? K : never;
}[keyof S];

type QueryKeys<S> = {
  [K in keyof S]: ReturnType<S[K]> extends undefined ? never : K;
}[keyof S];

type ActionMethod<S> = unknown extends S ? string : ActionKeys<S>;

type QueryMethod<S> = unknown extends S ? string : QueryKeys<S>;
type QueryResult<S, M> = M extends keyof S ? ReturnType<S[M]> : unknown;

type MethodArgs<S, K> = K extends keyof S
  ? S[K] extends (...args: infer A) => unknown
    ? A
    : never
  : unknown[];

/**
 * Typed Remote State client used by applications and React hooks.
 *
 * @typeParam S The type that defines the available service methods.
 */
export interface RemoteStateClient<S = unknown> {
  store: Store;
  tasks: WritableTaskStore;

  action: <M extends ActionMethod<S>>(
    method: M,
    args?: MethodArgs<S, M>,
    kwargs?: Record<string, unknown>,
    options?: ActionOptions,
  ) => Promise<void>;

  query: <M extends QueryMethod<S>>(
    method: M,
    args?: MethodArgs<S, M>,
    kwargs?: Record<string, unknown>,
    options?: QueryOptions,
  ) => Promise<QueryResult<S, M>>;

  dispose: () => void;
}

/**
 * Optional Remote State client integrations.
 *
 * Supplying `taskStore` lets applications keep task state in a custom store
 * instead of the built-in in-memory implementation.
 */
export interface RemoteStateClientOptions {
  taskStore?: WritableTaskStore;
}

/**
 * Create a Remote State client bound to one websocket endpoint.
 *
 * @typeParam S The type that defines the available service methods.
 * @param url The websocket endpoint URL. If not provided,
 *     it may be passed as query parameter `ws`. Otherwise,
 *     defaults to `ws(s)://{location.host}/ws`.
 * @param options Client options.
 */
export function createRemoteStateClient<S = unknown>(
  url?: string | null,
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

function coerceUrl(url: string | null | undefined): string {
  const explicitUrl = url?.trim();
  if (explicitUrl) {
    return normalizeWebSocketUrl(explicitUrl);
  }

  const params = new URLSearchParams(location.search);
  const queryUrl = params.get("ws")?.trim();
  if (queryUrl) {
    return queryUrl;
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
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
