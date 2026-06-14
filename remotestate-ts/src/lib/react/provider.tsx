import { useEffect, useMemo, type ReactNode } from "react";
import {
  createRemoteStateClient,
  type RemoteStateClient,
  type RemoteStateClientOptions,
} from "../client";
import { RemoteStateContext } from "./context";

export interface RemoteStateProviderProps extends RemoteStateClientOptions {
  /**
   * The websocket endpoint URL. If not provided, it may be passed as query
   * parameter `ws`. Otherwise, defaults to `ws(s)://{location.host}/ws`.
   */
  url?: string | null;

  /**
   * Whether this provider should create and expose a Remote State client.
   *
   * Set this to `false` when Remote State is intentionally unavailable and
   * consumers should use a local fallback instead.
   */
  active?: boolean;

  /**
   * Optional externally-created client. When provided, the provider exposes it
   * without taking ownership of its lifecycle.
   */
  client?: RemoteStateClient | null;

  children: ReactNode;
}

/**
 * React provider that exposes one Remote State client to child hooks.
 *
 * Properties:
 *
 * `url`: The websocket endpoint URL. If not provided,
 *     it may be passed as query parameter `ws`. Otherwise,
 *     defaults to `ws(s)://{location.host}/ws`.
 *
 * `taskStore`: Optional data store that receives and maintains
 *     task state information received from the backend.
 *
 * `active`: If false, no client is created or exposed. Use this when
 *     Remote State is intentionally unavailable and consumers should fall
 *     back to local state.
 *
 * `client`: Optional externally-created client. When supplied, this provider
 *     exposes the client without disposing it.
 */
export function RemoteStateProvider(props: RemoteStateProviderProps) {
  const {
    active = true,
    client: providedClient,
    url,
    taskStore,
    children,
  } = props;
  const hasProvidedClient = Object.hasOwn(props, "client");
  const client = useMemo(
    () =>
      active
        ? hasProvidedClient
          ? (providedClient ?? null)
          : createRemoteStateClient(url, taskStore ? { taskStore } : {})
        : null,
    [active, hasProvidedClient, providedClient, url, taskStore],
  );

  useEffect(() => {
    return () => {
      if (client && client !== providedClient) {
        client.dispose();
      }
    };
  }, [client, providedClient]);

  return (
    <RemoteStateContext.Provider value={client}>
      {children}
    </RemoteStateContext.Provider>
  );
}
