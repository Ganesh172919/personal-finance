/**
 * Deterministic debt payoff math used by the Goals & Debts page.
 *
 * All amounts are simulated month by month with interest rounded to cents,
 * so the payoff month count and total interest match a real amortization
 * schedule (the final payment is partial rather than a full minimum payment).
 */

// Model representing an active debt account for repayment simulations.
// Captures debt identifier, descriptive name, balance, APR, and minimum monthly payment.
// Feeds into amortization projection engines for comparative strategy analysis.
export interface DebtSim {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
}

// Repayment strategy type specifying debt repayment acceleration approach.
// Supports highest-interest avalanche, lowest-balance snowball, and minimum payment baselines.
// Directs allocation of extra surplus funds towards targeted debts.
export type PayoffStrategy = "avalanche" | "snowball" | "minimum";

// Result summary returned by the debt repayment simulation engine.
// Details months to zero balance, total accrued interest, payoff flag, and amortization health.
// Enables side-by-side comparison between accelerated plans and minimums.
export interface PayoffResult {
  /** Months until every debt is cleared (capped at maxMonths when not paid off). */
  months: number;
  /** Total interest accrued over the simulated period, rounded to cents. */
  totalInterest: number;
  /** True when every debt reaches a zero balance within maxMonths. */
  paidOff: boolean;
  /** True when at least one minimum payment does not cover its monthly interest. */
  negativeAmortization: boolean;
}

// Maximum month simulation cap equivalent to standard 30-year amortization.
// Prevents infinite loops when minimum payments fail to amortize loan balances.
// Establishes the temporal horizon for debt payoff projections.
export const PAYOFF_MAX_MONTHS = 360;

// Converts dollar currency values into integer cents for exact calculation.
// Eliminates binary floating point precision errors during compounding cycles.
// Handles invalid or non-numeric inputs gracefully by falling back to zero.
const toCents = (value: number) => Math.round((Number(value) || 0) * 100);

// Simulates month-by-month debt amortization and interest accrual in integer cents.
// Executes minimum, snowball, and avalanche payment reallocation strategies.
// Detects negative amortization when minimum payments fail to cover interest.
/**
 * Simulate paying down debts.
 *
 * - "minimum": every debt receives only its own minimum payment (baseline).
 * - "avalanche" / "snowball": the monthly budget is the sum of all original
 *   minimum payments plus `extraMonthly`. Minimums are paid first; whatever is
 *   left (the extra plus minimums freed up by debts already paid off) goes to
 *   the highest-APR (avalanche) or lowest-balance (snowball) debt.
 */
export function simulatePayoff(
  activeDebts: DebtSim[],
  extraMonthly: number,
  strategy: PayoffStrategy,
  maxMonths: number = PAYOFF_MAX_MONTHS
): PayoffResult {
  const debts = activeDebts
    .map(d => ({
      apr: Number(d.apr) || 0,
      minCents: Math.max(0, toCents(d.minPayment)),
      balanceCents: Math.max(0, toCents(d.balance)),
    }))
    .filter(d => d.balanceCents > 0);

  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, paidOff: true, negativeAmortization: false };
  }

  const extraCents = Math.max(0, toCents(extraMonthly));
  const monthlyBudgetCents =
    strategy === "minimum" ? 0 : debts.reduce((sum, d) => sum + d.minCents, 0) + extraCents;

  let totalInterestCents = 0;
  let months = 0;
  let negativeAmortization = false;

  while (months < maxMonths) {
    const remaining = debts.filter(d => d.balanceCents > 0);
    if (remaining.length === 0) break;
    months++;

    for (const d of remaining) {
      const interest = Math.round(d.balanceCents * (d.apr / 100 / 12));
      if (d.minCents <= interest) negativeAmortization = true;
      totalInterestCents += interest;
      d.balanceCents += interest;
    }

    let paidThisMonth = 0;
    for (const d of remaining) {
      const payment = Math.min(d.balanceCents, d.minCents);
      d.balanceCents -= payment;
      paidThisMonth += payment;
    }

    if (strategy !== "minimum") {
      let leftover = Math.max(0, monthlyBudgetCents - paidThisMonth);
      const targets = debts
        .filter(d => d.balanceCents > 0)
        .sort((a, b) =>
          strategy === "avalanche"
            ? b.apr - a.apr || a.balanceCents - b.balanceCents
            : a.balanceCents - b.balanceCents || b.apr - a.apr
        );
      for (const d of targets) {
        if (leftover <= 0) break;
        const extraPaid = Math.min(d.balanceCents, leftover);
        d.balanceCents -= extraPaid;
        leftover -= extraPaid;
      }
    }
  }

  const paidOff = debts.every(d => d.balanceCents <= 0);
  return {
    months,
    totalInterest: totalInterestCents / 100,
    paidOff,
    negativeAmortization,
  };
}

// Result structure representing payoff projections for a single isolated debt.
// Reports months until payoff, accumulated lifetime interest, and paid-off status.
// Used for displaying individual debt cards in debt list overviews.
export interface SingleDebtPayoff {
  months: number;
  totalInterest: number;
  paidOff: boolean;
}

// Computes payoff timeline and interest for an individual debt paying minimums.
// Extends horizon to 1200 months to evaluate extreme long-term balances.
// Wraps core simulation logic for single debt overview presentation.
/** Payoff timeline for one debt paying only its minimum payment. */
export function singleDebtPayoff(balance: number, apr: number, minPayment: number): SingleDebtPayoff {
  const result = simulatePayoff(
    [{ id: "single", name: "single", balance, apr, minPayment }],
    0,
    "minimum",
    1200
  );
  return { months: result.months, totalInterest: result.totalInterest, paidOff: result.paidOff };
}

// Distributes a total currency amount proportionally across weighted items with caps.
// Performs iterative integer-cent distribution avoiding rounding remainders.
// Reallocates spillover surpluses until all funds or individual caps are exhausted.
/**
 * Split `total` across items proportionally to `weight`, in whole cents, never giving an
 * item more than its `cap` (remaining amount). Rounding remainders go to the largest
 * fractional shares, and anything above an item's cap is redistributed to the others, so
 * the allocations sum to min(total, sum of caps) exactly.
 */
export function allocateByWeight(total: number, items: Array<{ weight: number; cap: number }>): number[] {
  const allocations = items.map(() => 0);
  let remainingCents = Math.max(0, toCents(total));
  const capCents = items.map(item => Math.max(0, toCents(item.cap)));
  const allocatedCents = items.map(() => 0);
  let open = items.map((_, i) => i).filter(i => capCents[i] > 0);

  while (remainingCents > 0 && open.length > 0) {
    const weights = open.map(i => Math.max(0, Number(items[i].weight) || 0));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const shares = open.map((_, k) => (totalWeight > 0 ? weights[k] / totalWeight : 1 / open.length) * remainingCents);
    const floors = shares.map(Math.floor);
    let leftover = remainingCents - floors.reduce((sum, v) => sum + v, 0);
    const order = shares
      .map((share, k) => ({ k, frac: share - floors[k] }))
      .sort((a, b) => b.frac - a.frac);
    for (const { k } of order) {
      if (leftover <= 0) break;
      floors[k] += 1;
      leftover -= 1;
    }

    let distributed = 0;
    open.forEach((i, k) => {
      const give = Math.min(floors[k], capCents[i] - allocatedCents[i]);
      allocatedCents[i] += give;
      distributed += give;
    });
    remainingCents -= distributed;
    open = open.filter(i => allocatedCents[i] < capCents[i]);
    if (distributed === 0) break;
  }

  allocatedCents.forEach((cents, i) => {
    allocations[i] = cents / 100;
  });
  return allocations;
}
