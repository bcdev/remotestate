import type { Path } from "./path";

/**
 * One changed store value.
 */
export interface StateUpdate {
  /**
   * Normalized path into the state.
   */
  path: Path;

  /**
   * Value at the path.
   */
  value: unknown;
}

// -------------------------------------------
// JS --> Python
// -------------------------------------------

/**
 * Request the current value at one store path.
 */
export interface GetMessage {
  /**
   * Protocol discriminator for store get requests.
   */
  type: "get";

  /**
   * Internal call ID used to correlate the response.
   */
  call_id: string;

  /**
   * State path to fetch.
   */
  path: Path;
}

/**
 * Write one value at a store path.
 */
export interface SetMessage {
  /**
   * Protocol discriminator for store set requests.
   */
  type: "set";

  /**
   * Internal call ID used to correlate the response.
   */
  call_id: string;

  /**
   * State path to write.
   */
  path: Path;

  /**
   * Value to assign at the path.
   */
  value: unknown;
}

/**
 * Invoke a state-mutating service method.
 */
export interface ActionMessage {
  /**
   * Protocol discriminator for action calls.
   */
  type: "action";

  /**
   * Internal call ID used to correlate the response.
   */
  call_id: string;

  /**
   * Optional user-supplied task ID for progress tracking.
   */
  task_id?: string;

  /**
   * Service action method name.
   */
  method: string;

  /**
   * Positional arguments passed to the action.
   */
  args: unknown[];

  /**
   * Keyword arguments passed to the action.
   */
  kwargs: Record<string, unknown>;
}

/**
 * Invoke a read-only service method that returns a value.
 */
export interface QueryMessage {
  /**
   * Protocol discriminator for query calls.
   */
  type: "query";

  /**
   * Internal call ID used to correlate the response.
   */
  call_id: string;

  /**
   * Optional user-supplied task ID for progress tracking.
   */
  task_id?: string;

  /**
   * Service query method name.
   */
  method: string;

  /**
   * Positional arguments passed to the query.
   */
  args: unknown[];

  /**
   * Keyword arguments passed to the query.
   */
  kwargs: Record<string, unknown>;
}

// -------------------------------------------
// Python --> JS
// -------------------------------------------

/**
 * Return one value requested by a previous `GetMessage`.
 */
export interface GetResultMessage {
  /**
   * Protocol discriminator for store get results.
   */
  type: "get_result";

  /**
   * Internal call ID from the request.
   */
  call_id: string;

  /**
   * State path that was fetched.
   */
  path: Path;

  /**
   * Value at the requested path.
   */
  value: unknown;
}

/**
 * Return the batched store updates produced by an action.
 */
export interface ActionResultMessage {
  /**
   * Protocol discriminator for action results.
   */
  type: "action_result";

  /**
   * Internal call ID from the request.
   */
  call_id: string;

  /**
   * Changed state values.
   */
  updates: StateUpdate[];
}

/**
 * Return the batched store updates produced by a store set request.
 */
export interface SetResultMessage {
  /**
   * Protocol discriminator for store set results.
   */
  type: "set_result";

  /**
   * Internal call ID from the request.
   */
  call_id: string;

  /**
   * Changed state values.
   */
  updates: StateUpdate[];
}

/**
 * Return the result of a previous `QueryMessage`.
 */
export interface QueryResultMessage {
  /**
   * Protocol discriminator for query results.
   */
  type: "query_result";

  /**
   * Internal call ID from the request.
   */
  call_id: string;

  /**
   * Value returned by the query.
   */
  value: unknown;
}

/**
 * Report progress for a tracked action or query.
 */
export interface TaskUpdateMessage {
  /**
   * Protocol discriminator for task progress updates.
   */
  type: "update_task";

  /**
   * Internal call ID for the running task.
   */
  call_id: string;

  /**
   * User-supplied task ID.
   */
  task_id: string;

  /**
   * Service method associated with the task.
   */
  method: string;

  /**
   * Current task status.
   */
  status: "running" | "done" | "error";

  /**
   * Optional short task name for display.
   */
  name?: string;

  /**
   * Optional task detail for display.
   */
  detail?: string;

  /**
   * Optional progress percentage from 0 to 100.
   */
  progress?: number; // 0-100

  /**
   * Optional error message when the task is in the `error` state.
   */
  error?: string;
}

/**
 * Return an error for a previous request.
 */
export interface ErrorMessage {
  /**
   * Protocol discriminator for errors.
   */
  type: "error";

  /**
   * Internal call ID from the failed request.
   */
  call_id: string;

  /**
   * Error message returned by Python.
   */
  message: string;
}

// -------------------------------------------
// Derived
// -------------------------------------------

/**
 * Any message the Remote State bridge can send to Python.
 */
export type IncomingMessage =
  | GetMessage
  | SetMessage
  | ActionMessage
  | QueryMessage;

/**
 * Any message Python can send back to the Remote State bridge.
 */
export type OutgoingMessage =
  | GetResultMessage
  | SetResultMessage
  | ActionResultMessage
  | QueryResultMessage
  | TaskUpdateMessage
  | ErrorMessage;
