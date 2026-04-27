import { ReactNode, useMemo } from "react";
import { createClient } from "../client";
import { ClientContext } from "./context";

export function ClientProvider({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  /**
   * Convenience context for a zwieback client created for the given `url`.
   */
  const client = useMemo(() => createClient(url), [url]);

  return (
    <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
  );
}
