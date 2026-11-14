/**
 * @fileoverview Tier 4: Real-World Workload & Socio-Economic Personas — FinWise Bharat Voice.
 *
 * Simulates high-fidelity Indian socio-economic operational personas using
 * real-world colloquial utterances, code-mixed Indic languages, and double-entry
 * ledger verification:
 * - Scenario 4.1: Kirana Store Daily Cash & UPI Sales Tally (Evening shop closing)
 * - Scenario 4.2: Street Commuter Auto Fare & Shared Travel Split (Bangalore commute)
 * - Scenario 4.3: Rural Mandi Harvest Sales & Agricultural Input Purchases (APMC wheat & tractor fuel)
 * - Scenario 4.4: Informal Micro-Merchant Hand Loans & WhatsApp Collection (Chennai tea stall Udhar)
 * - Scenario 4.5: Festival Shopping & Gold Investment (Vijayawada Dhanteras gold chain)
 *
 * @module test/e2e/tier4_real_world.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { configurePassport } from "../../config/passport";
import { startTestDb, stopTestDb } from "../testDb";
import { createAuthedSession, type AuthedSession } from "./helpers/authHelper";
import TransactionModel from "../../models/transactionModel";

describe("Tier 4: Real-World Personas — FinWise Bharat Voice", () => {
  const app = createApp();
  let session: AuthedSession;

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    session = await createAuthedSession(app);
  });

  afterAll(async () => {
    await stopTestDb();
  });

  // ==========================================================================
  // Scenario 4.1: Kirana Store Daily Cash & UPI Sales Tally
  // ==========================================================================
  describe("Scenario 4.1: Kirana Store Daily Cash & UPI Sales Tally", () => {
    it("records daily evening shop closing sales and inventory restock payment", async () => {
      // 1. Merchant logs evening cash and UPI revenue
      const salesRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Counter bikri se 12350 rupaye kamayi cash aur UPI me aaya",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(salesRes.status).toBe(201);
      expect(salesRes.body.success).toBe(true);
      expect(salesRes.body.data.extractedExpense.amount).toBe(12350);
      expect(salesRes.body.data.extractedExpense.type).toBe("income");

      // 2. Merchant logs wholesaler payment for provisions restock
      const supplierRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Sharma ji wholesaler ko 1200 rupaye rashan dukan payment diya cash",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(supplierRes.status).toBe(201);
      expect(supplierRes.body.success).toBe(true);
      expect(supplierRes.body.data.extractedExpense.amount).toBe(1200);
      expect(supplierRes.body.data.extractedExpense.category).toBe("Groceries");
      expect(supplierRes.body.data.extractedExpense.type).toBe("expense");

      // 3. Verify double-entry ledger records
      const salesTx = salesRes.body.data.transaction;
      const supplierTx = supplierRes.body.data.transaction;

      expect(salesTx?.type).toBe("income");
      expect(salesTx?.amount).toBeCloseTo(12350 / 83.5, 10);
      expect(supplierTx?.type).toBe("expense");
      expect(supplierTx?.amount).toBeCloseTo(-1200 / 83.5, 10);

      // Net positive cash flow verified: 12,350 - 1,200 = 11,150
      expect(salesTx.amount + supplierTx.amount).toBeCloseTo(11150 / 83.5, 10);
    });
  });

  // ==========================================================================
  // Scenario 4.2: Street Commuter Auto Fare & Shared Travel Split
  // ==========================================================================
  describe("Scenario 4.2: Street Commuter Auto Fare & Shared Travel Split", () => {
    it("records urban auto-rickshaw commute fare paid by cash", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Indiranagar se Koramangala auto fare 180 rupees split cash given",
            language: "en-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const extracted = res.body.data.extractedExpense;
      expect(extracted.amount).toBe(180);
      expect(extracted.category).toBe("Transport");
      expect(extracted.paymentMethod).toBe("Cash");
      expect(extracted.merchantName).toContain("Auto");

      // Verify spoken confirmation mentions amount and category
      expect(res.body.data.spokenConfirmation).toContain("180");
      expect(res.body.data.audioFeedback.mimeType).toBe("audio/wav");
    });
  });

  // ==========================================================================
  // Scenario 4.3: Rural Mandi Harvest Sales & Agricultural Input Purchases
  // ==========================================================================
  describe("Scenario 4.3: Rural Mandi Harvest Sales & Agricultural Inputs", () => {
    it("records APMC Mandi harvest crop income and tractor fuel expense", async () => {
      // 1. Farmer records wheat harvest crop sale income
      const harvestRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Gehun bikri se 92000 rupaye kamayi account me credit hua",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(harvestRes.status).toBe(201);
      expect(harvestRes.body.success).toBe(true);
      expect(harvestRes.body.data.extractedExpense.amount).toBe(92000);
      expect(harvestRes.body.data.extractedExpense.type).toBe("income");

      // 2. Farmer records tractor diesel fuel input expense
      const fuelRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Tractor diesel ke liye 2200 rupaye nagad diye pump par",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(fuelRes.status).toBe(201);
      expect(fuelRes.body.success).toBe(true);
      expect(fuelRes.body.data.extractedExpense.amount).toBe(2200);
      expect(fuelRes.body.data.extractedExpense.category).toBe("Transport");
      expect(fuelRes.body.data.extractedExpense.paymentMethod).toBe("Cash");
    });
  });

  // ==========================================================================
  // Scenario 4.4: Informal Micro-Merchant Hand Loans (Udhar / Baki Khata)
  // ==========================================================================
  describe("Scenario 4.4: Informal Micro-Merchant Hand Loans (Udhar / Baki Khata)", () => {
    it("manages tea stall vendor Udhar credit and WhatsApp collection reminder lifecycle", async () => {
      // 1. Vendor logs informal credit for daily construction customer
      const creditRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Ramesh bhai ko 350 rupaye udhar chai vadai shaniwar tak lautao",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(creditRes.status).toBe(201);
      expect(creditRes.body.success).toBe(true);
      expect(creditRes.body.data.khata.amount).toBe(350);
      expect(creditRes.body.data.khata.contactName).toContain("Ramesh");
      expect(creditRes.body.data.khata.direction).toBe("lent");

      // Spoken WhatsApp collection reminder note generated
      expect(creditRes.body.data.khata.reminderSpeech).toContain("₹350");
      expect(creditRes.body.data.khata.audioReminder).toBeDefined();

      // 2. Customer repays credit on Saturday
      const settleRes = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/collections")
          .send({
            transcript: "Ramesh bhai se 350 rupaye mila udhar wapas chukaya",
            language: "hi-IN",
            currency: "INR",
          })
      );

      expect(settleRes.status).toBe(201);
      expect(settleRes.body.success).toBe(true);
      expect(settleRes.body.data.khata.amount).toBe(350);
      expect(settleRes.body.data.khata.direction).toBe("collected");
      expect(settleRes.body.data.khata.reminderSpeech).toContain("Dhanyawad");
    });
  });

  // ==========================================================================
  // Scenario 4.5: Small Town Festival Shopping & Gold Purchase
  // ==========================================================================
  describe("Scenario 4.5: Festival Shopping & Gold Purchase", () => {
    it("records Dhanteras gold jewellery purchase in Telugu via PhonePe UPI", async () => {
      const res = await session.applyAuth(
        request(app)
          .post("/api/v1/voice/log-expense")
          .send({
            transcript: "Kalyan Jewellers lo 45,000 petti gold chain konnamu PhonePe dwara",
            language: "te-IN",
            currency: "INR",
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const extracted = res.body.data.extractedExpense;
      expect(extracted.amount).toBe(45000);
      expect(extracted.category).toBe("Investment");
      expect(extracted.merchantName).toBe("Kalyan Jewellers");
      expect(extracted.paymentMethod).toContain("PhonePe");
      expect(extracted.type).toBe("investment");

      // Verify Telugu spoken audio response
      expect(res.body.data.audioFeedback.language).toBe("te-IN");
      expect(res.body.data.spokenConfirmation).toContain("₹45,000");

      // Verify transaction returned with correct type
      const tx = res.body.data.transaction;
      expect(tx?.type).toBe("investment");
      expect(tx?.amount).toBeCloseTo(-45000 / 83.5, 10);
    });
  });
});
