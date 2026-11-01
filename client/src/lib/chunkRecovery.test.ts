import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installChunkRecovery } from "./chunkRecovery";

let cleanup: (() => void) | undefined;
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); });
const fail = () => {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

it("refreshes an outdated deployment once and suppresses the import error", () => {
  const reload = vi.fn();
  cleanup = installChunkRecovery(reload);
  expect(fail().defaultPrevented).toBe(true);
  expect(reload).toHaveBeenCalledTimes(1);
});

it("keeps persistent failures visible after a reload instead of looping", () => {
  const reload = vi.fn();
  cleanup = installChunkRecovery(reload);
  fail();
  cleanup();
  cleanup = installChunkRecovery(reload);
  expect(fail().defaultPrevented).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
});

it("allows recovery after the deployment retry cooldown", () => {
  const reload = vi.fn();
  vi.spyOn(Date, "now").mockReturnValueOnce(100_000).mockReturnValueOnce(160_001);
  cleanup = installChunkRecovery(reload);
  fail();
  fail();
  expect(reload).toHaveBeenCalledTimes(2);
});

it("does not trigger an unsafe reload when session storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled"); });
  const reload = vi.fn();
  cleanup = installChunkRecovery(reload);
  expect(fail().defaultPrevented).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});
