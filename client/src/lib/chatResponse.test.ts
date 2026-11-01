import { expect, it } from "vitest";
import { splitAnswerAndPlan } from "./chatResponse";

const plan = "FINANCIAL PLAN\n====================\n\nSavings and debt actions.";
it("retains both a quoted document answer and the complete financial plan", () => {
  const answer = "## From your files\n\nloan.pdf · page 4\n> Prepayment fee USD 25";
  expect(splitAnswerAndPlan(`${answer}\n\n${plan}`)).toEqual({ answer, plan });
});
it("keeps a standalone financial plan visible", () => {
  expect(splitAnswerAndPlan(plan)).toEqual({ answer: plan });
  expect(splitAnswerAndPlan(`\n${plan}`)).toEqual({ answer: `\n${plan}` });
});
it("does not split ordinary prose or a quoted heading inside a document", () => {
  for (const content of ["Here is your answer", "> FINANCIAL PLAN\n> ====================\nQuoted source", "A FINANCIAL PLAN is useful"]) {
    expect(splitAnswerAndPlan(content)).toEqual({ answer: content });
  }
});
it("supports CRLF and preserves all plan content", () => {
  const result = splitAnswerAndPlan(`Income USD 7500\r\n\r\n${plan.replaceAll("\n", "\r\n")}`);
  expect(result.answer).toBe("Income USD 7500");
  expect(result.plan).toBe(plan.replaceAll("\n", "\r\n"));
});
