import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClientProvider } from "../lib";
import App from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}
createRoot(root).render(
  <StrictMode>
    <ClientProvider url={"http://localhost:9753"}>
      <App />
    </ClientProvider>
  </StrictMode>,
);
