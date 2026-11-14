import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TransactionModel from "../models/transactionModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const app = createApp();
let cookies: string[]; let token: string;
beforeAll(async () => { await startTestDb(); configurePassport(); });
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  const auth = await createAuthedUser();
  const csrf = await request(app).get("/api/auth/csrf").expect(200);
  cookies = [auth.cookie, (csrf.headers["set-cookie"]?.[0] || "").split(";")[0]];
  token = csrf.body.csrf_token;
});
const post = (path: string, body: object = {}) => request(app).post(path).set("Cookie", cookies).set("X-CSRF-Token", token).send(body);
const create = async (description: string) => (await post("/api/transactions", { amount: 12.34, type: "expense", category: "Supplies", description, date: "2026-11-05" }).expect(201)).body.transaction.id;
type ListedTransaction = { id: string; review: { needs_attention: boolean } };
const list = async (query = ""): Promise<ListedTransaction[]> => (await request(app).get(`/api/transactions${query}`).set("Cookie", cookies).expect(200)).body.transactions;

it("retains approval on subsequent reads and unchanged edits, but reopens materially changed records", async () => {
  const id = await create("Approval persistence QA");
  await post(`/api/transactions/${id}/approve`).expect(200);
  expect((await list()).find(tx => tx.id === id)?.review.needs_attention).toBe(false);
  expect((await list("?needs_review=true")).some(tx => tx.id === id)).toBe(false);
  await request(app).patch(`/api/transactions/${id}`).set("Cookie", cookies).set("X-CSRF-Token", token).send({ amount: 12.34 }).expect(200);
  expect((await list()).find(tx => tx.id === id)?.review.needs_attention).toBe(false);
  await request(app).patch(`/api/transactions/${id}`).set("Cookie", cookies).set("X-CSRF-Token", token).send({ amount: 13.45 }).expect(200);
  expect((await list("?needs_review=true")).some(tx => tx.id === id)).toBe(true);
});

it("reopens approved records changed through a bulk write, including splits", async () => {
  const id = await create("Bulk edit approval QA");
  await post(`/api/transactions/${id}/approve`).expect(200);
  await TransactionModel.updateOne({ _id: id }, { $set: { splits: [
    { category: "Groceries", amount: 6.17 }, { category: "Utilities", amount: 6.17 },
  ] } });
  expect((await list("?needs_review=true")).some(tx => tx.id === id)).toBe(true);
});

it("does not approve another user's record through either endpoint", async () => {
  const id = await create("Owned approval QA");
  const other = await createAuthedUser();
  const foreignCookies = [other.cookie, cookies[1]];
  await request(app).post(`/api/transactions/${id}/approve`).set("Cookie", foreignCookies).set("X-CSRF-Token", token).send({}).expect(404);
  const result = await request(app).post("/api/transactions/bulk-approve").set("Cookie", foreignCookies).set("X-CSRF-Token", token).send({ transaction_ids: [id] }).expect(200);
  expect(result.body.modified).toBe(0);
  expect((await list("?needs_review=true")).some(tx => tx.id === id)).toBe(true);
});

it("keeps bulk-approved records out of the review queue after a reload", async () => {
  const ids = [await create("First bulk approval QA"), await create("Second bulk approval QA")];
  await post("/api/transactions/bulk-approve", { transaction_ids: ids }).expect(200);
  expect((await list("?needs_review=true")).filter(tx => ids.includes(tx.id))).toEqual([]);
  expect((await list()).filter(tx => ids.includes(tx.id)).every(tx => tx.review.needs_attention === false)).toBe(true);
});
