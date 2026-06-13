import { useEffect, useMemo, type ReactNode } from "react";
import { createRemoteStateClient } from "../client";
import { RemoteStateContext } from "./context";
import type { WritableTaskStore } from "../tasks";

/**
 * React provider that creates and exposes one Remote State client
 * to child hooks.
 *
 * Properties:
 *
 * `url`: The websocket endpoint URL. If not provided,
 *     it may be passed as query parameter `ws`. Otherwise,
 *     defaults to `ws(s)://{location.host}/ws`.
 *
 * `taskStore`: Optional data store that receives and maintains
 *     task state information received from the backend.
 */
export function RemoteStateProvider({
  url,
  taskStore,
  children,
}: {
  url?: string | null;
  taskStore?: WritableTaskStore;
  children: ReactNode;
}) {
  const client = useMemo(
    () => createRemoteStateClient(url, taskStore ? { taskStore } : {}),
    [url, taskStore],
  );

  useEffect(() => {
    return () => {
      client.dispose();
    };
  }, [client]);

  return (
    <RemoteStateContext.Provider value={client}>
      {children}
    </RemoteStateContext.Provider>
  );
}
