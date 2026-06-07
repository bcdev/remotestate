import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";

import { RemoteStateProvider } from "remotestate";

const base = (location.host + location.pathname).replace(/\/$/, "");
const wsUrl = `ws://${base}/ws`;

console.info("WS-URL:", wsUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RemoteStateProvider url={wsUrl}>
      <App />
    </RemoteStateProvider>
  </StrictMode>,
);
