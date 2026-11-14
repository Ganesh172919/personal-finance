import { describe, expect, it } from "vitest";
import { allocateByWeight, simulatePayoff, singleDebtPayoff } from "./goalsDebtsMath";

describe("singleDebtPayoff", () => {
  it("charges a partial final payment instead of a full extra minimum", () => {
    // $1,000 at 12% APR, $100/mo: 10 full payments + a partial 11th.
    const result = singleDebtPayoff(1000, 12, 100);
    expect(result.paidOff).toBe(true);
    expect(result.months).toBe(11);
    // Exact amortization interest is ~$58.98, not 11*100-1000 = $100.
    expect(result.totalInterest).toBeGreaterThan(58);
    expect(result.totalInterest).toBeLessThan(60);
  });

  it("handles 0% APR", () => {
    expect(singleDebtPayoff(1000, 0, 100)).toEqual({ months: 10, totalInterest: 0, paidOff: true });
  });

  it("flags a debt whose minimum never covers interest as not paid off", () => {
    expect(singleDebtPayoff(2000, 29.9, 40).paidOff).toBe(false);
  });
});

describe("simulatePayoff", () => {
  const debts = [
    { id: "a", name: "Small", balance: 500, apr: 10, minPayment: 100 },
    { id: "b", name: "Big", balance: 5000, apr: 20, minPayment: 100 },
  ];

  it("rolls freed-up minimum payments into the next debt (snowball/avalanche)", () => {
    const withRollover = simulatePayoff(debts, 0, "snowball");
    const minimumOnly = simulatePayoff(debts, 0, "minimum");
    // Without rollover the $100 from the small debt is lost once it is paid off.
    expect(withRollover.paidOff).toBe(true);
    expect(minimumOnly.paidOff).toBe(true);
    expect(withRollover.months).toBeLessThan(minimumOnly.months);
    expect(withRollover.totalInterest).toBeLessThan(minimumOnly.totalInterest);
  });

  it("reports not paid off when minimums never cover interest", () => {
    const result = simulatePayoff(
      [{ id: "s", name: "Store", balance: 2000, apr: 29.9, minPayment: 40 }],
      0,
      "minimum"
    );
    expect(result.paidOff).toBe(false);
    expect(result.negativeAmortization).toBe(true);
  });

  it("returns an empty result for no active debts", () => {
    expect(simulatePayoff([], 100, "avalanche")).toEqual({
      months: 0,
      totalInterest: 0,
      paidOff: true,
      negativeAmortization: false,
    });
  });

  it("avalanche never pays more interest than snowball", () => {
    const av = simulatePayoff(debts, 250, "avalanche");
    const sb = simulatePayoff(debts, 250, "snowball");
    expect(av.totalInterest).toBeLessThanOrEqual(sb.totalInterest);
  });
});


describe("allocateByWeight (windfall split)", () => {
  it("distributes every cent of a windfall", () => {
    const parts = allocateByWeight(1000.5, [
      { weight: 9, cap: 10000 },
      { weight: 5, cap: 10000 },
      { weight: 7, cap: 10000 },
    ]);
    const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum).toBe(1000.5);
    parts.forEach(p => expect(Math.round(p * 100)).toBe(p * 100));
  });

  it("redistributes the excess above a goal's remaining balance to other goals", () => {
    const parts = allocateByWeight(1000, [
      { weight: 1, cap: 100.25 },
      { weight: 1, cap: 5000 },
    ]);
    expect(parts[0]).toBe(100.25);
    expect(parts[1]).toBe(899.75);
  });

  it("never allocates more than the total remaining across goals", () => {
    const parts = allocateByWeight(5000, [
      { weight: 3, cap: 10 },
      { weight: 1, cap: 20.5 },
    ]);
    expect(parts).toEqual([10, 20.5]);
  });
});
