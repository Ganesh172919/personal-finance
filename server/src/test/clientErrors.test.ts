import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createClientErrorRouter } from "../routes/clientErrors";

const diagnostic = {
  source: "render",
  category: "auth-context",
  route: "chat-local",
  frames: ["src/hooks/useAuth.tsx:9:5"],
};

function testApp() {
  const app = express();
  const warn = vi.fn();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = "test-report-id";
    req.log = { warn } as unknown as typeof req.log;
    next();
  });
  app.use("/api/client-errors", createClientErrorRouter());
  return { api: request(app), warn };
}

describe("client error ingestion", () => {
  it("acknowledges a structured report and writes one correlated event", async () => {
    const { api, warn } = testApp();
    const response = await api.post("/api/client-errors").send(diagnostic).expect(202);
    expect(response.body).toEqual({ request_id: "test-report-id" });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { event: "client.error.reported", ...diagnostic },
      "Browser error received",
    );
  });

  it("rejects raw messages, URL-bearing frames, and non-JSON reports", async () => {
    const { api, warn } = testApp();
    await api.post("/api/client-errors").send({ ...diagnostic, message: "private" }).expect(400);
    await api.post("/api/client-errors").send({ ...diagnostic, frames: ["/src/test.ts?token=private:1:2"] }).expect(400);
    await api.post("/api/client-errors").type("text").send(JSON.stringify(diagnostic)).expect(400);
    expect(warn).not.toHaveBeenCalled();
  });

  it("caps the number of reports logged per source IP", async () => {
    const { api, warn } = testApp();
    for (let index = 0; index < 10; index++) {
      await api.post("/api/client-errors").send(diagnostic).expect(202);
    }
    await api.post("/api/client-errors").send(diagnostic).expect(429);
    expect(warn).toHaveBeenCalledTimes(10);
  });
});
