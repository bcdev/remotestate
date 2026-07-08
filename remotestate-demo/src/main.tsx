import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { RemoteStateProvider, createLocalStateClient } from "remotestate";
import { type Path, getPathAt, setPathAt } from "remotestate/path";

import "./index.css";
import App from "./App";
import type { State } from "./state";

const wsUrl = getWsUrl();
console.info("WebSocket URL:", wsUrl);

const useStore = create<State>()(() => ({ items: [], selected_item_id: null }));

function createFallback() {
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
