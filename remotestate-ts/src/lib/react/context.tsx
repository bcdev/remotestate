import { createContext } from "react";
import { type RemoteStateClient } from "../client";

export const RemoteStateContext = createContext<RemoteStateClient | null>(null);
