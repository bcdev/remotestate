import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";

import { RemoteStateProvider } from "remotestate";

function getWsUrl() {
  const wsUrl = new URLSearchParams(location.search).get("ws");
  if (wsUrl && wsUrl !== "") {
    return wsUrl;
  }
  const wsBase = (location.host + location.pathname).replace(/\/$/, "");
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${wsBase}/ws`;
}

const wsUrl = getWsUrl();
console.info("WebSocket URL:", wsUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RemoteStateProvider url={wsUrl}>
      <App />
    </RemoteStateProvider>
  </StrictMode>,
);
