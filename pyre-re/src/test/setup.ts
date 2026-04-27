import "@testing-library/jest-dom";

// Mock crypto.randomUUID — not available in jsdom
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => Math.random().toString(36).slice(2) },
});
