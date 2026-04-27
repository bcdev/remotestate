import { StoreImpl } from "./store";
import { ServiceImpl, type ActionOptions, type QueryOptions } from "./service";
import { TransportImpl } from "./transport";
import { Store } from "./types";

type ReturnType<T> = T extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

type ActionKeys<TService> = {
  [K in keyof TService]: ReturnType<TService[K]> extends undefined ? K : never;
}[keyof TService];

type QueryKeys<TService> = {
  [K in keyof TService]: ReturnType<TService[K]> extends undefined ? never : K;
}[keyof TService];

type MethodArgs<TService, K extends keyof TService> = TService[K] extends (
  ...args: infer A
) => unknown
  ? A
  : never;

export interface Client<TService = unknown> {
  store: Store;

  action: <M extends ActionKeys<TService>>(
    method: M,
    args?: MethodArgs<TService, M>,
    kwargs?: Record<string, unknown>,
    options?: ActionOptions,
  ) => Promise<void>;

  query: <M extends QueryKeys<TService>>(
    method: M,
    args?: MethodArgs<TService, M>,
    kwargs?: Record<string, unknown>,
    options?: QueryOptions,
  ) => Promise<ReturnType<TService[M]>>;

  dispose: () => void;
}

export function createClient<TService>(url: string): Client<TService> {
  const transport = new TransportImpl(url);
  const store = new StoreImpl(transport);
  const service = new ServiceImpl(transport);

  return {
    store,

    action: (method, args = [] as never, kwargs = {}, options = {}) =>
      service.action(method as string, args, kwargs, options),

    query: <M extends QueryKeys<TService>>(
      method: M,
      args: MethodArgs<TService, M> = [] as never,
      kwargs: Record<string, unknown> = {},
    ) =>
      service.query(method as string, args, kwargs) as Promise<
        ReturnType<TService[M]>
      >,

    dispose: () => {
      store.dispose();
      transport.close();
    },
  };
}
