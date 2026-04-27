import { PyreStore, usePyreStore } from "./store";
import { PyreService, type ActionOptions, type QueryOptions } from "./service";
import { PyreTransport } from "./transport";

export type { ActionOptions };
export type { OutgoingMessage, IncomingMessage } from "./protocol";
export type { IPyreTransport, IPyreStore, IPyreService } from "./types";
export { usePyreStore } from "./store";

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

export interface PyreClient<TService> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  useStore: <T>(path: string) => T | undefined;

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

export function createPyreClient<TService>(url: string): PyreClient<TService> {
  const transport = new PyreTransport(url);
  const store = new PyreStore(transport);
  const service = new PyreService(transport);

  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    useStore: <T = unknown>(path: string) => usePyreStore<T>(store, path),

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
