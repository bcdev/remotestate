export { createClient } from "./client";
export type { IncomingMessage, OutgoingMessage } from "./protocol";
export type { ActionOptions, QueryOptions } from "./service";
export type { Store, Service } from "./types";

// TODO: consider a dedicated package zwieback-react
export { useClient, useStore, useState, useStateValue } from "./react/hooks";
export { ClientProvider } from "./react/provider";
