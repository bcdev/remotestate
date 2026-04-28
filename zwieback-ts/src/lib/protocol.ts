// -------------------------------------------
// JS --> Python
// -------------------------------------------

export interface GetMessage {
  type: "get";
  id: string;
  path: string;
}

export interface ActionMessage {
  type: "action";
  id: string;
  tid?: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

export interface QueryMessage {
  type: "query";
  id: string;
  tid?: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

// -------------------------------------------
// Python --> JS
// -------------------------------------------

export interface GetResultMessage {
  type: "get_result";
  id: string;
  path: string;
  value: unknown;
}

export interface QueryResultMessage {
  type: "query_result";
  id: string;
  value: unknown;
}

export interface InvalidateMessage {
  type: "invalidate";
  id: string;
  updates: Record<string, unknown>; // path --> value mapping
}

export interface TaskUpdateMessage {
  type: "task_update";
  id: string;
  tid: string;
  method: string;
  status: "running" | "done" | "error";
  name?: string;
  detail?: string;
  progress?: number; // 0-100
  error?: string;
}

export interface ErrorMessage {
  type: "error";
  id: string;
  message: string;
}

// -------------------------------------------
// Derived
// -------------------------------------------

export type IncomingMessage = GetMessage | ActionMessage | QueryMessage;
export type OutgoingMessage =
  | GetResultMessage
  | InvalidateMessage
  | QueryResultMessage
  | TaskUpdateMessage
  | ErrorMessage;
