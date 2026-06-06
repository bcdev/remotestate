import { createContext } from "react";
import { type RemoteState } from "../client";

export const RemoteStateContext = createContext<RemoteState | null>(null);
export const ClientContext = RemoteStateContext;
