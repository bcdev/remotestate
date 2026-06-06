import { useEffect, useMemo, type ReactNode } from "react";
import { createRemoteState } from "../client";
import { RemoteStateContext } from "./context";
import type { WritableTaskStore } from "../tasks";

/**
 * React provider that creates and exposes one Remote State bridge to child hooks.
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
  const remoteState = useMemo(
    () => createRemoteState(url, taskStore ? { taskStore } : {}),
    [url, taskStore],
  );

  useEffect(() => {
    return () => {
      remoteState.dispose();
    };
  }, [remoteState]);

  return (
    <RemoteStateContext.Provider value={remoteState}>
      {children}
    </RemoteStateContext.Provider>
  );
}

export const ClientProvider = RemoteStateProvider;
