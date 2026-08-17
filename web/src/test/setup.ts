import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver — required by Radix UI primitives (e.g. Select,
// used by the signup organization dropdown, F-03 phase 2).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}