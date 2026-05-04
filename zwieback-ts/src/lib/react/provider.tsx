import { useEffect, useMemo, type ReactNode } from "react";
import { createClient } from "../client";
import { ClientContext } from "./context";
import type { WritableTaskStore } from "../tasks";

/**
 * React provider that creates and exposes one client instance to child hooks.
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
export function ClientProvider({
  url,
  taskStore,
  children,
}: {
  url?: string | null;
  taskStore?: WritableTaskStore;
  children: ReactNode;
}) {
  const client = useMemo(
    () => createClient(url, taskStore ? { taskStore } : {}),
    [url, taskStore],
  );

  useEffect(() => {
    return () => {
      client.dispose();
    };
  }, [client]);

  return (
    <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
  );
}
