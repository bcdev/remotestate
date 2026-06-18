import { useEffect, useMemo, type ReactNode } from "react";
import {
  type RemoteStateClient,
  type RemoteStateClientOptions,
} from "../client";
import { createRemoteStateClient } from "../remote";
import { RemoteStateContext } from "./context";

export interface RemoteStateProviderProps<
  S = unknown,
> extends RemoteStateClientOptions {
  /**
   * The websocket endpoint URL. If omitted or blank, `fallback` is used.
   */
  url?: string | null;

  /**
   * Factory for a local RemoteState-compatible client used when no URL is
   * configured.
   */
  fallback?: () => RemoteStateClient<S>;

  /**
   * Optional externally-created client. When provided, the provider exposes it
   * without taking ownership of its lifecycle.
   */
  client?: RemoteStateClient<S>;

  /**
   * React children rendered inside the provider.
   */
  children: ReactNode;
}

/**
 * React provider that exposes one Remote State client to child hooks.
 *
 * Properties:
 *
 * `url`: The websocket endpoint URL. If omitted or blank, `fallback` is used.
 *
 * `taskStore`: Optional data store that receives and maintains
 *     task state information received from the backend.
 *
 * `fallback`: Factory for a local RemoteState-compatible client used when no
 *     URL is configured.
 *
 * `client`: Optional externally-created client. When supplied, this provider
 *     exposes the client without disposing it.
 *
 * @param props Provider configuration and children.
 * @returns A React context provider element.
 * @throws If no `url`, `fallback`, or non-null `client` is provided.
 */
export function RemoteStateProvider<S = unknown>(
  props: RemoteStateProviderProps<S>,
) {
  const { client: providedClient, fallback, url, taskStore, children } = props;
  const hasProvidedClient = Object.hasOwn(props, "client");
  const client: RemoteStateClient<S> = useMemo(() => {
    if (hasProvidedClient) {
      if (!providedClient) {
        throw new Error("RemoteStateProvider client cannot be null");
      }
      return providedClient;
    }

    const explicitUrl = url?.trim();
    if (explicitUrl) {
      return createRemoteStateClient(
        explicitUrl,
        taskStore ? { taskStore } : {},
      );
    }

    if (fallback) {
      return fallback();
    }

    throw new Error("RemoteStateProvider requires either url or fallback");
  }, [hasProvidedClient, providedClient, url, taskStore, fallback]);

  useEffect(() => {
    return () => {
      if (client !== providedClient) {
        client.dispose();
      }
    };
  }, [client, providedClient]);

  return (
    <RemoteStateContext.Provider value={client as RemoteStateClient}>
      {children}
    </RemoteStateContext.Provider>
  );
}
