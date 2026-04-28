import { useEffect, useMemo, type ReactNode } from "react";
import { createClient } from "../client";
import { ClientContext } from "./context";
import type { WritableTaskStore } from "../tasks";

export function ClientProvider({
  url,
  taskStore,
  children,
}: {
  url: string;
  taskStore?: WritableTaskStore;
  children: ReactNode;
}) {
  /**
   * Convenience context for a zwieback client created for the given `url`.
   */
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
