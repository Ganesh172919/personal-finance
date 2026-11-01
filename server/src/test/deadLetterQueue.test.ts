import { afterEach, expect, it, vi } from "vitest";
vi.mock("../config/logger", () => ({ logger: { warn: vi.fn() } }));
import { clearDeadLetters, fireAndForget, getDeadLetters, getDeadLetterStats, recordDeadLetter } from "../services/deadLetterQueue";

afterEach(clearDeadLetters);

it("records handled receipt-event failures and existing background failures in the same queue", async () => {
  recordDeadLetter({ operation: "publishDomainEvent", context: "ReceiptConfirmedEvent", error: new Error("Event unavailable"), payload: { receiptId: "qa-receipt" } });
  fireAndForget(Promise.reject(new Error("Usage unavailable")), "record usage", { userId: "qa-user" });
  await Promise.resolve();
  expect(getDeadLetters()).toEqual([
    expect.objectContaining({ operation: "publishDomainEvent", error: "Event unavailable", context: { source: "ReceiptConfirmedEvent", receiptId: "qa-receipt" } }),
    expect.objectContaining({ operation: "record usage", error: "Usage unavailable", context: { userId: "qa-user" } }),
  ]);
  expect(getDeadLetterStats()).toEqual({ publishDomainEvent: 1, "record usage": 1 });
});

it("evicts the oldest failure at the queue bound", () => {
  for (let index = 0; index < 501; index++) recordDeadLetter({ operation: `op-${index}`, error: "Unavailable" });
  expect(getDeadLetters()).toHaveLength(500);
  expect(getDeadLetters()[0].operation).toBe("op-1");
  expect(getDeadLetters().at(-1)?.operation).toBe("op-500");
});
