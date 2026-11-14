import { describe, expect, it } from "vitest";
import { getSubmissionCountdown, GNANI_SUBMISSION_DEADLINE } from "./gnaniChallenge";

describe("submission countdown", () => {
  const deadline = Date.parse(GNANI_SUBMISSION_DEADLINE);

  it("uses the published IST deadline and includes days", () => {
    expect(new Date(deadline).toISOString()).toBe("2026-11-15T12:30:00.000Z");
    expect(getSubmissionCountdown(deadline - 97_384_000)).toBe("1d 3h 03m 04s");
  });

  it("shows the last partial second and stops at the deadline", () => {
    expect(getSubmissionCountdown(deadline - 1)).toBe("0h 00m 01s");
    expect(getSubmissionCountdown(deadline)).toBeNull();
    expect(getSubmissionCountdown(deadline + 1000)).toBeNull();
  });
});
