export type DebugLog = (message: string, ...args: unknown[]) => void;

export function getDebugLog(debug?: unknown): DebugLog {
  if (debug === undefined || !!debug) {
    return debugLog;
  } else {
    return () => {};
  }
}

export const debugLog: DebugLog = (
  message: string,
  ...args: unknown[]
): void => {
  console.log(`remotestate:`, message, ...args);
};
