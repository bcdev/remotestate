import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { RemoteStateProvider, createLocalStateClient } from "remotestate";
import { type Path, getPathAt, setPathAt } from "remotestate/path";

import "./index.css";
import App from "./App";
import type { ItemStatus, State } from "./state";

const wsUrl = getWsUrl();
console.info("WebSocket URL:", wsUrl);

const useStore = create<State>()(() => ({ items: [], selected_item_id: null }));

function createFallback() {
  let last_id = 0;

  return createLocalStateClient({
    store: {
      get(path?: Path): unknown {
        return getPathAt(useStore.getState(), path);
      },
      set(path: Path, value: unknown): void {
        const newState = setPathAt(useStore.getState(), path, value);
        useStore.setState(newState);
      },
      provide() {},
      dispose() {},
      subscribe(_path: Path, listener: () => void): () => void {
        return useStore.subscribe(listener);
      },
    },
    actions: {
      add_item(title: string) {
        useStore.setState((s) => ({
          items: [
            ...s.items,
            {
              id: ++last_id,
              created: new Date().toISOString(),
              title,
              status: "todo",
            },
          ],
        }));
      },
      remove_item(item_id: number) {
        useStore.setState((s) => ({
          items: s.items.filter((item) => item.id !== item_id),
        }));
      },
      set_item_status(item_id: number, status: ItemStatus) {
        useStore.setState((s) => ({
          items: s.items.map((item) =>
            item.id === item_id ? { ...item, status } : item,
          ),
        }));
      },
      set_item_title(item_id: number, title: string) {
        useStore.setState((s) => ({
          items: s.items.map((item) =>
            item.id === item_id ? { ...item, title } : item,
          ),
        }));
      },
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RemoteStateProvider url={wsUrl} fallback={createFallback}>
      <App />
    </RemoteStateProvider>
  </StrictMode>,
);

function getWsUrl() {
  const wsUrl = new URLSearchParams(location.search).get("ws");
  if (wsUrl && wsUrl !== "") {
    return wsUrl;
  }
  throw new Error("Missing ws query parameter");
}
