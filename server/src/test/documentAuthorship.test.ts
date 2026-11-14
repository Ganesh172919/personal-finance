import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import FinancialProfileModel from "../models/financialProfileModel";
import OrganizationModel from "../models/organizationModel";
import { populateProfileTemplateData } from "../services/richDocumentRenderer";
import WorkspaceFileModel from "../models/workspaceFileModel";
import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Document Authorship & Rich Layout API (POST /api/files/authored-document)", () => {
  const app = createApp();
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    await WorkspaceKnowledgeChunkModel.init();
    await WorkspaceFileModel.init();
    await FinancialProfileModel.init();
  }, 60_000);

  afterAll(stopTestDb);

  beforeEach(async () => {
    await clearTestDb();
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token);
  });

  it("rejects unauthenticated requests with 401", async () => {
    await request(app)
      .post("/api/files/authored-document")
      .send({ title: "Unauthorized Test Doc" })
      .expect(401);
  });

  it("does not invent financial figures when the owner has no saved profile", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    for (const format of ["standard", "executive_brief", "tax_prep_summary", "cash_flow_audit", "debt_payoff_schedule", "net_worth_statement"] as const) {
      const data = await populateProfileTemplateData({ orgId, userId: auth.user._id, format });
      expect(data.kpis).toEqual([]);
      expect(data.tables).toEqual([]);
      expect(data.summaryText).toContain("No saved financial profile");
    }
  });

  it("uses workspace currency, retains zero balances and reports negative cash flow", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    await OrganizationModel.updateOne({ _id: orgId }, { currency: "EUR" });
    await FinancialProfileModel.create({ orgId, userId: auth.user._id, age: 25,
      annual_income: 0, monthly_expenses: 1000, savings: 0, goals: [], debts: [],
      risk_tolerance: "moderate", investment_experience: "beginner",
    });
    const data = await populateProfileTemplateData({ orgId, userId: auth.user._id, format: "cash_flow_audit" });
    const values = data.kpis.map(kpi => kpi.value);
    expect(values).toContain("EUR 0.00");
    expect(values).toContain("EUR -1,000.00");
    expect(JSON.stringify(data)).not.toContain("$");
    expect(JSON.stringify(data)).not.toContain("2,800");
    const tax = await populateProfileTemplateData({ orgId, userId: auth.user._id, format: "tax_prep_summary" });
    expect(JSON.stringify(tax)).not.toContain("29,200");
    expect(JSON.stringify(tax)).not.toContain("16.8%");
  });

  it("rejects invalid request body with 400", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({ title: "" }) // Empty title violates min(1)
      .expect(400);
  });

  it("authors an Executive Financial Brief with KPI cards and table schedules", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const res = await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        title: "FinWise Executive Financial Advisory Brief - Q4 2026",
        format: "executive_brief",
        content:
          "# Executive Summary\nOverall financial health indicates a stable monthly operating surplus with liquid reserves covering 8.5 months of operational expenses.\n\n# Strategic Objectives\n- Maximize tax-advantaged employer retirement contributions\n- Rebalance equity allocation towards low-cost global index ETFs",
        kpis: [
          { label: "Monthly Surplus", value: "$4,250.00", subtext: "Operating Inflow - Outflow" },
          { label: "Emergency Runway", value: "8.5 Months", subtext: "Fully Liquid Reserves" },
          { label: "Debt-to-Income", value: "18.4%", subtext: "Conservative Risk Band" },
          { label: "Savings Rate", value: "32.5%", subtext: "Above Peer Cohort Median" },
        ],
        tables: [
          {
            title: "Strategic Action Roadmap",
            headers: ["Priority", "Objective", "Horizon", "Impact"],
            rows: [
              ["High", "High-Yield Reserve Optimization", "30 Days", "$18,000.00"],
              ["High", "Index SIP Dollar-Cost Averaging", "Recurring", "$2,500.00"],
            ],
          },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.title).toBe("FinWise Executive Financial Advisory Brief - Q4 2026");
    expect(res.body.document.format).toBe("executive_brief");
    expect(res.body.document.mimeType).toBe("application/pdf");
    expect(res.body.document.sizeBytes).toBeGreaterThan(0);
    expect(res.body.document.pageCount).toBeGreaterThanOrEqual(1);

    // Verify stored file record in Mongo
    const storedFile = await WorkspaceFileModel.findById(res.body.document.workspaceFileId);
    expect(storedFile).not.toBeNull();
    expect(storedFile?.originalName).toContain("executive_financial_advisory_brief");
    expect(storedFile?.kind).toBe("document");
    expect(storedFile?.extractedText).toContain("Executive Summary");
  });

  it("authors a Tax Preparation Summary pre-populated with user financial profile data", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    // Seed profile data
    await FinancialProfileModel.create({
      orgId,
      userId: auth.user._id,
      age: 35,
      annual_income: 140000,
      monthly_expenses: 7000,
      savings: 50000,
      currency: "USD",
    });

    const res = await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        title: "Tax Year 2026 Preparation & Deduction Audit",
        format: "tax_prep_summary",
        includeProfileData: true,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.document.format).toBe("tax_prep_summary");
    expect(res.body.document.sizeBytes).toBeGreaterThan(0);

    const storedFile = await WorkspaceFileModel.findById(res.body.document.workspaceFileId);
    expect(storedFile?.extractedText).toContain("Tax preparation summary");
  });

  it("authors a Cash Flow & Envelope Burn Audit document with variance calculations", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const res = await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        title: "Monthly Cash Flow & Envelope Burn Audit",
        format: "cash_flow_audit",
        content:
          "# Executive Cash Flow Analysis\nTotal operating inflows of $12,500.00 exceeded total operating outflows of $7,800.00, yielding a monthly surplus of $4,700.00.",
        kpis: [
          { label: "Gross Inflows", value: "$12,500.00", subtext: "Net Take-Home" },
          { label: "Operating Outflows", value: "$7,800.00", subtext: "All Envelopes" },
          { label: "Net Surplus", value: "$4,700.00", subtext: "Surplus Liquidity" },
        ],
        tables: [
          {
            title: "Envelope Spending Allocation & Variance",
            headers: ["Category", "Budget", "Actual", "Variance %", "Status"],
            rows: [
              ["Housing", "$2,800.00", "$2,800.00", "0.0%", "Optimal"],
              ["Groceries", "$1,200.00", "$1,150.00", "-4.2%", "Optimal"],
              ["Discretionary", "$900.00", "$1,100.00", "+22.2%", "Over"],
            ],
          },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.document.format).toBe("cash_flow_audit");
    expect(res.body.document.sizeBytes).toBeGreaterThan(0);

    const storedFile = await WorkspaceFileModel.findById(res.body.document.workspaceFileId);
    expect(storedFile?.extractedText).toContain("Executive Cash Flow Analysis");
  });

  it("authors a Debt Amortization Schedule with Avalanche priority ordering", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const res = await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        title: "Accelerated Debt Amortization & Payoff Schedule",
        format: "debt_payoff_schedule",
        content:
          "# Debt Amortization Strategy\nImplementing debt avalanche (highest APR first) to minimize lifetime interest charges.\n\n# Priority Schedule\n- Credit Card Prime: $8,500.00 at 19.9% APR\n- Auto Loan: $18,000.00 at 5.4% APR",
        kpis: [
          { label: "Total Debt", value: "$48,500.00", subtext: "3 Loans" },
          { label: "Blended APR", value: "8.4%", subtext: "Weighted" },
          { label: "Projected Interest Saved", value: "$6,420.00", subtext: "Via Avalanche" },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.document.format).toBe("debt_payoff_schedule");

    const storedFile = await WorkspaceFileModel.findById(res.body.document.workspaceFileId);
    expect(storedFile?.extractedText).toContain("Debt Amortization Strategy");
  });

  it("authors a Consolidated Balance Sheet with Assets - Liabilities = Net Worth conservation", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const res = await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        title: "Consolidated Balance Sheet & Net Worth Statement",
        format: "net_worth_statement",
        content:
          "# Balance Sheet Summary\nTotal verified assets of $348,500.00 offset by total liabilities of $48,500.00 yield a Net Worth of $300,000.00.",
        kpis: [
          { label: "Total Assets", value: "$348,500.00", subtext: "Liquid + Locked Holdings" },
          { label: "Total Liabilities", value: "$48,500.00", subtext: "Short + Long Term Debts" },
          { label: "Net Worth", value: "$300,000.00", subtext: "Assets - Liabilities" },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.document.format).toBe("net_worth_statement");

    const storedFile = await WorkspaceFileModel.findById(res.body.document.workspaceFileId);
    expect(storedFile?.extractedText).toContain("Balance Sheet Summary");
    expect(storedFile?.extractedText).toContain("300,000.00");
  });

  it("authors a Standard Custom Document parsing rich markdown blocks, tables, and callouts", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const res = await request(app)
      .post("/api/files/authored-document")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId.toString())
      .send({
        title: "Custom Directives & Milestone Plan",
        format: "standard",
        content:
          ":::kpi Emergency Fund | $50,000.00 | Liquid Target :::\n\n# Strategic Directives\nAutomate transfers on the 1st of every month.\n\n| Goal | Target | Vehicle |\n| Emergency | $50,000.00 | HYSA |\n| 529 College | $25,000.00 | Plan |\n\n:::callout Note: High-yield rate guaranteed through Q4 2026. :::",
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.document.format).toBe("standard");

    const storedFile = await WorkspaceFileModel.findById(res.body.document.workspaceFileId);
    expect(storedFile?.extractedText).toContain("Strategic Directives");
  });
});
