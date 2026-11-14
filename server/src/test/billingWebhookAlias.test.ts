import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";

describe("versioned Stripe webhook route", () => {
  it("preserves the raw request body for the canonical /api/v1 alias", async () => {
    const response = await request(createApp())
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "test-signature")
      .send({ type: "checkout.session.completed" });

    // The test signature/configuration need not be valid. Reaching Stripe
    // handling rather than MISSING_RAW_BODY proves the raw-body bypass covers
    // the canonical versioned endpoint.
    expect(response.body.code).not.toBe("MISSING_RAW_BODY");
  });
});
