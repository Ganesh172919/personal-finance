import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { requestContext } from "../middleware/requestContext";
import { responseContext } from "../middleware/responseContext";

describe("responseContext middleware", () => {
  const app = express();
  app.use(requestContext);
  app.use(responseContext);

  app.get("/ok", (_req, res) => {
    res.status(200).json({ message: "ok" });
  });

  app.get("/err", (_req, res) => {
    res.status(418).json({ message: "teapot" });
  });

  it("adds request_id to successful object responses", async () => {
    const response = await request(app).get("/ok").expect(200);

    expect(response.body.message).toBe("ok");
    expect(response.body.request_id).toBeTypeOf("string");
  });

  it("adds default error code when missing on error responses", async () => {
    const response = await request(app).get("/err").expect(418);

    expect(response.body.message).toBe("teapot");
    expect(response.body.code).toBe("REQUEST_FAILED");
    expect(response.body.request_id).toBeTypeOf("string");
  });
});
