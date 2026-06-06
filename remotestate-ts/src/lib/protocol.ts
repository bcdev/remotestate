// -------------------------------------------
// JS --> Python
// -------------------------------------------

/**
 * Request the current value at one store path.
 */
export interface GetMessage {
  type: "get";
  call_id: string;
  path: string;
}

/**
 * Invoke a state-mutating service method.
 */
export interface ActionMessage {
  type: "action";
  call_id: string;
  task_id?: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

/**
 * Invoke a read-only service method that returns a value.
 */
export interface QueryMessage {
  type: "query";
  call_id: string;
  task_id?: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

// -------------------------------------------
// Python --> JS
// -------------------------------------------

/**
 * Return one value requested by a previous `GetMessage`.
 */
export interface GetResultMessage {
  type: "get_result";
  call_id: string;
  path: string;
  value: unknown;
}

/**
 * Return the batched store updates produced by an action.
 */
export interface ActionResultMessage {
  type: "action_result";
  call_id: string;
  updates: Record<string, unknown>; // path --> value mapping
}

/**
 * Return the result of a previous `QueryMessage`.
 */
export interface QueryResultMessage {
  type: "query_result";
  call_id: string;
  value: unknown;
}

/**
 * Report progress for a tracked action or query.
 */
export interface TaskUpdateMessage {
  type: "update_task";
  call_id: string;
  task_id: string;
  method: string;
  status: "running" | "done" | "error";
  name?: string;
  detail?: string;
  progress?: number; // 0-100
  error?: string;
}

/**
 * Return an error for a previous request.
 */
export interface ErrorMessage {
  type: "error";
  call_id: string;
  message: string;
}

// -------------------------------------------
// Derived
// -------------------------------------------

/**
 * Any message the Remote State bridge can send to Python.
 */
export type IncomingMessage = GetMessage | ActionMessage | QueryMessage;

/**
 * Any message Python can send back to the Remote State bridge.
 */
export type OutgoingMessage =
  | GetResultMessage
  | ActionResultMessage
  | QueryResultMessage
  | TaskUpdateMessage
  | ErrorMessage;
