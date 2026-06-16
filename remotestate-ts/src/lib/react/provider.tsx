import { useEffect, useMemo, type ReactNode } from "react";
import {
  createRemoteStateClient,
  type RemoteStateClient,
  type RemoteStateClientOptions,
} from "../client";
import { RemoteStateContext } from "./context";

export interface RemoteStateProviderProps extends RemoteStateClientOptions {
  /**
   * The websocket endpoint URL. If omitted or blank, `fallback` is used.
   */
  url?: string | null;

  /**
   * Factory for a local RemoteState-compatible client used when no URL is
   * configured.
   */
  fallback?: () => RemoteStateClient;

  /**
   * Optional externally-created client. When provided, the provider exposes it
   * without taking ownership of its lifecycle.
   */
  client?: RemoteStateClient;

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
 */
export function RemoteStateProvider(props: RemoteStateProviderProps) {
  const { client: providedClient, fallback, url, taskStore, children } = props;
  const hasProvidedClient = Object.hasOwn(props, "client");
  const client = useMemo(() => {
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
    <RemoteStateContext.Provider value={client}>
      {children}
    </RemoteStateContext.Provider>
  );
}
