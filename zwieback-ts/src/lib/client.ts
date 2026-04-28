import { StoreImpl } from "./store";
import { ServiceImpl, type ActionOptions, type QueryOptions } from "./service";
import { TransportImpl } from "./transport";
import { Store } from "./types";
import {
  createTaskStore,
  TaskController,
  type WritableTaskStore,
} from "./tasks";

type ReturnType<T> = T extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

type ActionKeys<TService> = {
  [K in keyof TService]: ReturnType<TService[K]> extends undefined ? K : never;
}[keyof TService];

type QueryKeys<TService> = {
  [K in keyof TService]: ReturnType<TService[K]> extends undefined ? never : K;
}[keyof TService];

type ActionMethod<TService> = unknown extends TService
  ? string
  : ActionKeys<TService>;

type QueryMethod<TService> = unknown extends TService
  ? string
  : QueryKeys<TService>;
type QueryResult<TService, M> = M extends keyof TService
  ? ReturnType<TService[M]>
  : unknown;

type MethodArgs<TService, K> = K extends keyof TService
  ? TService[K] extends (...args: infer A) => unknown
    ? A
    : never
  : unknown[];

/**
 * Typed client facade used by applications and React hooks.
 */
export interface Client<TService = unknown> {
  store: Store;
  tasks: WritableTaskStore;

  action: <M extends ActionMethod<TService>>(
    method: M,
    args?: MethodArgs<TService, M>,
    kwargs?: Record<string, unknown>,
    options?: ActionOptions,
  ) => Promise<void>;

  query: <M extends QueryMethod<TService>>(
    method: M,
    args?: MethodArgs<TService, M>,
    kwargs?: Record<string, unknown>,
    options?: QueryOptions,
  ) => Promise<QueryResult<TService, M>>;

  dispose: () => void;
}

/**
 * Optional client integrations.
 *
 * Supplying `taskStore` lets applications keep task state in a custom store
 * instead of the built-in in-memory implementation.
 */
export interface ClientOptions {
  taskStore?: WritableTaskStore;
}

/**
 * Create a zwieback client bound to one websocket endpoint.
 */
export function createClient<TService = unknown>(
  url: string,
  options: ClientOptions = {},
): Client<TService> {
  const transport = new TransportImpl(url);
  const store = new StoreImpl(transport);
  const taskStore = options.taskStore ?? createTaskStore();
  const ownsTaskStore = options.taskStore === undefined;
  const taskController = new TaskController(taskStore, transport);
  const service = new ServiceImpl(transport, taskController);

  return {
    store,
    tasks: taskStore,

    action: (method, args = [] as never, kwargs = {}, options = {}) =>
      service.action(method as string, args, kwargs, options),

    query: <M extends QueryMethod<TService>>(
      method: M,
      args: MethodArgs<TService, M> = [] as never,
      kwargs: Record<string, unknown> = {},
      options: QueryOptions = {},
    ) =>
      service.query(method as string, args, kwargs, options) as Promise<
        QueryResult<TService, M>
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
