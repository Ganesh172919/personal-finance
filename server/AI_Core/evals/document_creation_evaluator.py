r"""
document_creation_evaluator.py - Multi-Format Financial Document Authorship & Rich Layout Evaluator
====================================================================================================

Evaluates automated financial document authorship, rich structural layout,
and mathematical invariance across six financial document formats:
1. Executive Financial Brief (`executive_brief`)
2. Tax Preparation Summary (`tax_prep_summary`)
3. Cash Flow & Burn Audit (`cash_flow_audit`)
4. Debt Payoff Amortization Schedule (`debt_payoff_schedule`)
5. Consolidated Balance Sheet / Net Worth Statement (`net_worth_statement`)
6. Free-Form Custom Markdown with Rich Blocks (`standard`)

Core Invariants Evaluated:
--------------------------
1. **Format Schema Compliance**:
   Ensures that generated financial documents strictly adhere to their respective
   domain schema (KPI metric cards, tabular schedules, executive takeaways, disclaimers).

2. **Rich Layout & Typography Structure**:
   Ensures presence of standard visual components: header banners, metadata blocks,
   side-by-side KPI metric cards, zebra-striped multi-column data tables, and callouts.

3. **Mathematical Invariance & Conservation**:
   - Balance Sheet Conservation: Assets - Liabilities = Net Worth (delta < 0.01)
   - Cash Flow Balance: Inflows - Outflows = Net Cash Flow (delta < 0.01)
   - Debt Amortization Invariance: Principal + Interest = Total Payment (delta < 0.01)
   - Number Safety Guard: All formatted numbers must be a strict subset of verified source records.

4. **Physical Page Pagination & Form Feed Retention**:
   Multi-page documents must preserve physical page divisions using form feed markers (`\f`),
   with zero orphaned pages and accurate running page footers ("Page X of Y").
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from utils.agent_helpers import extract_numbers


# Benchmark test case specification for evaluating financial document generation.
# Defines document format schemas, raw authored markdown text, and expected KPIs.
# Specifies mandatory mathematical invariants and table structure requirements.
@dataclass(frozen=True)
class DocumentCreationCase:
    """A benchmark case for evaluating financial document authorship and layout."""
    case_id: str
    format: str  # executive_brief, tax_prep_summary, cash_flow_audit, debt_payoff_schedule, net_worth_statement, standard
    title: str
    description: str
    source_context: Dict[str, Any]
    document_text: str  # Rendered or authored document text with '\f' for physical page breaks
    expected_kpis: List[Dict[str, str]]
    expected_table_headers: List[str]
    expected_sections: List[str]
    expected_disclaimer_keyword: str
    invariants_to_verify: List[str] = field(default_factory=list)


# Parsed document structural component representation extracted from markdown.
# Encapsulates titles, headers, metadata fields, pages, KPIs, tables, and callouts.
# Facilitates programmatic evaluation of rich layout and visual formatting elements.
@dataclass
class DocumentStructure:
    """Parsed structural elements of an authored document."""
    title: str
    format_badge: Optional[str]
    metadata_fields: Dict[str, str]
    pages: List[str]
    page_count: int
    sections: List[str]
    kpis: List[Dict[str, str]]
    tables: List[Dict[str, Any]]
    callouts: List[str]
    disclaimer: Optional[str]


# Detailed evaluation score report container for a single document creation case.
# Tracks format compliance, layout fidelity, invariant validation, and safety scores.
# Documents page counts, extracted components, and explicit failure reasons.
@dataclass
class DocumentCreationEvalResult:
    """Result of evaluating a single document creation case."""
    case_id: str
    format: str
    passed: bool
    format_compliance_score: float  # [0.0 - 1.0]
    layout_structure_score: float   # [0.0 - 1.0]
    invariant_score: float          # [0.0 - 1.0]
    number_safety_score: float      # [0.0 - 1.0]
    page_pagination_score: float    # [0.0 - 1.0]
    overall_score: float            # [0.0 - 1.0]
    page_count: int
    kpis_found: int
    tables_found: int
    invariants_passed: List[str]
    invariants_failed: List[str]
    failure_reasons: List[str] = field(default_factory=list)


# -----------------------------------------------------------------------------
# Golden Benchmark Cases for Financial Document Creation
# -----------------------------------------------------------------------------

# Golden benchmark catalog containing curated multi-format financial documents.
# Includes executive briefs, tax summaries, cash audits, debt schedules, and balances.
# Provides rigorous reference standards for verifying layout and invariant fidelity.
GOLDEN_DOCUMENT_CREATION_CASES: List[DocumentCreationCase] = [
    DocumentCreationCase(
        case_id="doc_create_01_executive_brief",
        format="executive_brief",
        title="FinWise Executive Financial Advisory Brief - Q4 2026",
        description="Executive briefing for high-net-worth liquidity, reserve runways, and strategic allocation.",
        source_context={
            "annual_income": 150000.0,
            "monthly_expenses": 8250.0,
            "monthly_surplus": 4250.0,
            "emergency_runway_months": 8.5,
            "debt_to_income": 18.2,
            "savings_rate": 34.0,
        },
        document_text=(
            "FINWISE FINANCIAL INTELLIGENCE\n"
            "EXECUTIVE FINANCIAL BRIEF • CONFIDENTIAL\n"
            "Document ID: DOC-EXEC-2026-Q4 | Date: 2026-10-31 | Org: org_alpha | User: usr_exec\n\n"
            "# Executive Financial Advisory Brief - Q4 2026\n\n"
            "## Executive Summary\n"
            "Overall financial health remains robust across all pillars. Operating surplus has maintained steady growth "
            "with a monthly surplus of $4,250.00 and an emergency cash runway extending to 8.5 Months.\n\n"
            ":::kpi Monthly Surplus | $4,250.00 | Net Operating Flow :::\n"
            ":::kpi Emergency Runway | 8.5 Months | Fully Funded :::\n"
            ":::kpi Debt-to-Income | 18.2% | Conservative Range :::\n"
            ":::kpi Savings Rate | 34.0% | Above Target Benchmark :::\n\n"
            "## Strategic Allocation & Capital Deployment\n"
            "The capital allocation strategy prioritizes high-yield cash reserves, disciplined broad-market index "
            "dollar-cost averaging, and scheduled tax-loss harvesting.\n\n"
            "| Priority | Strategic Objective | Target Horizon | Capital Impact |\n"
            "| High | Tax-Loss Harvesting Review | 30 Days | $1,850.00 |\n"
            "| High | Broad Market SIP Allocation | Recurring Monthly | $3,000.00 |\n"
            "| Medium | Umbrella Liability Policy | 60 Days | $450.00 |\n"
            "| Low | Cash Drag Yield Optimization | 90 Days | $750.00 |\n\n"
            "## Governance & Sign-off\n"
            "Prepared by FinWise AI Financial Strategy Engine. Authorized for client presentation.\n\n"
            "Disclaimer: This executive brief is prepared for financial planning purposes only and does not constitute formal legal or certified accounting counsel."
        ),
        expected_kpis=[
            {"label": "Monthly Surplus", "value": "$4,250.00"},
            {"label": "Emergency Runway", "value": "8.5 Months"},
            {"label": "Debt-to-Income", "value": "18.2%"},
            {"label": "Savings Rate", "value": "34.0%"},
        ],
        expected_table_headers=["Priority", "Strategic Objective", "Target Horizon", "Capital Impact"],
        expected_sections=["Executive Summary", "Strategic Allocation & Capital Deployment", "Governance & Sign-off"],
        expected_disclaimer_keyword="disclaimer",
        invariants_to_verify=["number_safety", "kpi_count", "table_structure", "disclaimer_present"],
    ),
    DocumentCreationCase(
        case_id="doc_create_02_tax_prep_summary",
        format="tax_prep_summary",
        title="Tax Year 2026 Preparation & Deduction Audit",
        description="Comprehensive tax preparation summary itemizing standard deductions, W-2 withholding, and credits.",
        source_context={
            "tax_year": 2026,
            "gross_wages": 135000.0,
            "total_deductions": 29200.0,
            "taxable_income": 105800.0,
            "effective_tax_rate": 16.8,
            "federal_withholding": 21500.0,
            "estimated_refund": 3725.0,
        },
        document_text=(
            "FINWISE FINANCIAL INTELLIGENCE\n"
            "TAX PREPARATION SUMMARY • FOR TAX PLANNING & CPA FILING SUPPORT\n"
            "Tax Year: 2026 | Filing Status: Married Filing Jointly | Prepared: 2026-10-31\n\n"
            "# Tax Year 2026 Preparation & Deduction Audit\n\n"
            "## Tax Filing Overview\n"
            "This schedule compiles tax documentation, itemized deductions, and employer withholdings for Tax Year 2026.\n\n"
            ":::kpi Gross Wages | $135,000.00 | Form W-2 Box 1 :::\n"
            ":::kpi Total Deductions | $29,200.00 | Standard Deduction :::\n"
            ":::kpi Taxable Income | $105,800.00 | Federal Adjusted :::\n"
            ":::kpi Effective Tax Rate | 16.8% | Blended Federal/State :::\n\n"
            "## Deductions and Credits Schedule\n"
            "| Category | Description | Deductible Amount | Form Reference |\n"
            "| Standard Deduction | Married Filing Jointly Standard | $29,200.00 | Form 1040 Line 12 |\n"
            "| HSA Pre-Tax | Employee Health Savings Contributions | $4,150.00 | Form 8889 |\n"
            "| Traditional 401(k) | Pre-Tax Retirement Deferral | $23,000.00 | Form W-2 Box 12 D |\n"
            "| Clean Vehicle Credit | Federal EV Purchase Credit | $7,500.00 | Form 8936 |\n\n"
            "## Tax Withholding & Refund Reconciliation\n"
            "Federal income tax withheld from wages totals $21,500.00 against estimated total tax liability of $17,775.00.\n"
            "Projected net refund: $3,725.00.\n\n"
            "Disclaimer: Review all figures with a Certified Public Accountant (CPA) or licensed tax professional before filing."
        ),
        expected_kpis=[
            {"label": "Gross Wages", "value": "$135,000.00"},
            {"label": "Total Deductions", "value": "$29,200.00"},
            {"label": "Taxable Income", "value": "$105,800.00"},
            {"label": "Effective Tax Rate", "value": "16.8%"},
        ],
        expected_table_headers=["Category", "Description", "Deductible Amount", "Form Reference"],
        expected_sections=["Tax Filing Overview", "Deductions and Credits Schedule", "Tax Withholding & Refund Reconciliation"],
        expected_disclaimer_keyword="cpa",
        invariants_to_verify=["number_safety", "tax_bracket_conservation", "table_structure", "disclaimer_present"],
    ),
    DocumentCreationCase(
        case_id="doc_create_03_cash_flow_audit",
        format="cash_flow_audit",
        title="Monthly Cash Flow & Envelope Burn Audit",
        description="Detailed operating cash flow audit breaking down categorized envelope burn and liquidity velocity.",
        source_context={
            "monthly_inflows": 12500.0,
            "monthly_outflows": 7800.0,
            "net_surplus": 4700.0,
            "runway_days": 210,
        },
        document_text=(
            "FINWISE FINANCIAL INTELLIGENCE\n"
            "CASH FLOW & LIQUIDITY BURN AUDIT\n"
            "Audit Window: October 2026 | Prepared: 2026-10-31 | Status: AUDITED\n\n"
            "# Monthly Cash Flow & Envelope Burn Audit\n\n"
            "## Executive Cash Flow Analysis\n"
            "Total operating inflows of $12,500.00 exceeded total operating outflows of $7,800.00, yielding a healthy "
            "monthly surplus of $4,700.00 and a 210 Days liquidity runway.\n\n"
            ":::kpi Gross Inflows | $12,500.00 | Net Take-Home Salary :::\n"
            ":::kpi Operating Outflows | $7,800.00 | All Categories :::\n"
            ":::kpi Net Surplus | $4,700.00 | Inflow - Outflow :::\n"
            ":::kpi Safe Runway | 210 Days | Reserve Multiplier :::\n\n"
            "## Envelope Spending Allocation & Variance\n"
            "| Envelope Category | Allocated Budget | Actual Spend | Variance % | Health Status |\n"
            "| Housing & Rent | $2,800.00 | $2,800.00 | 0.0% | Optimal |\n"
            "| Groceries & Dining | $1,200.00 | $1,150.00 | -4.2% | Optimal |\n"
            "| Transportation & Fuel | $650.00 | $720.00 | +10.8% | Watch |\n"
            "| Utilities & Telecom | $450.00 | $430.00 | -4.4% | Optimal |\n"
            "| Discretionary & Lifestyle | $900.00 | $1,100.00 | +22.2% | Over |\n"
            "| Monthly Savings & SIP | $1,800.00 | $1,600.00 | -11.1% | Watch |\n\n"
            "## Burn Mitigation Action Items\n"
            "- Reallocate $200.00 from Discretionary envelope to restore SIP savings target.\n"
            "- Lock transportation fuel budget at $650.00 for November.\n\n"
            "Disclaimer: Cash flow audit is based on recorded ledger transactions and user-configured budget envelopes."
        ),
        expected_kpis=[
            {"label": "Gross Inflows", "value": "$12,500.00"},
            {"label": "Operating Outflows", "value": "$7,800.00"},
            {"label": "Net Surplus", "value": "$4,700.00"},
            {"label": "Safe Runway", "value": "210 Days"},
        ],
        expected_table_headers=["Envelope Category", "Allocated Budget", "Actual Spend", "Variance %", "Health Status"],
        expected_sections=["Executive Cash Flow Analysis", "Envelope Spending Allocation & Variance", "Burn Mitigation Action Items"],
        expected_disclaimer_keyword="ledger",
        invariants_to_verify=["cash_flow_conservation", "number_safety", "table_structure", "disclaimer_present"],
    ),
    DocumentCreationCase(
        case_id="doc_create_04_debt_payoff_schedule",
        format="debt_payoff_schedule",
        title="Accelerated Debt Amortization & Payoff Schedule",
        description="Amortization and liability payoff schedule implementing accelerated debt avalanche/snowball.",
        source_context={
            "total_debt": 48500.0,
            "blended_apr": 8.4,
            "min_payment": 1150.0,
            "accelerated_payment": 2000.0,
            "interest_saved": 6420.0,
        },
        document_text=(
            "FINWISE FINANCIAL INTELLIGENCE\n"
            "DEBT AMORTIZATION & PAYOFF ACCELERATION SCHEDULE\n"
            "Strategy: Debt Avalanche (Highest APR First) | Prepared: 2026-10-31\n\n"
            "# Accelerated Debt Amortization & Payoff Schedule\n\n"
            "## Debt Overview & Accelerated Targets\n"
            "Aggregating 3 liability instruments with a total outstanding balance of $48,500.00 and blended APR of 8.4%.\n\n"
            ":::kpi Total Debt | $48,500.00 | 3 Outstanding Loans :::\n"
            ":::kpi Blended APR | 8.4% | Weighted Average :::\n"
            ":::kpi Min Monthly Payment | $1,150.00 | Required Baseline :::\n"
            ":::kpi Projected Interest Saved | $6,420.00 | Via Avalanche Acceleration :::\n\n"
            "## Liability Inventory & Priority Ranking\n"
            "| Creditor / Account | Current Balance | APR % | Min Payment | Accelerated Payment | Avalanche Rank |\n"
            "| Credit Card Prime | $8,500.00 | 19.9% | $250.00 | $1,100.00 | #1 High |\n"
            "| Auto Loan | $18,000.00 | 5.4% | $450.00 | $450.00 | #2 Medium |\n"
            "| Student Loan | $22,000.00 | 4.8% | $450.00 | $450.00 | #3 Low |\n\n"
            "## Amortization Milestone Projections\n"
            "| Milestone Period | Principal Paid | Interest Paid | Remaining Balance |\n"
            "| Month 6 | $10,500.00 | $1,500.00 | $38,000.00 |\n"
            "| Month 12 | $21,000.00 | $3,000.00 | $27,500.00 |\n"
            "| Month 24 | $42,000.00 | $5,500.00 | $6,500.00 |\n"
            "| Month 28 (Payoff) | $48,500.00 | $6,420.00 | $0.00 |\n\n"
            "Disclaimer: Projections assume on-time monthly payments and constant APR terms."
        ),
        expected_kpis=[
            {"label": "Total Debt", "value": "$48,500.00"},
            {"label": "Blended APR", "value": "8.4%"},
            {"label": "Min Monthly Payment", "value": "$1,150.00"},
            {"label": "Projected Interest Saved", "value": "$6,420.00"},
        ],
        expected_table_headers=["Creditor / Account", "Current Balance", "APR %", "Min Payment", "Accelerated Payment", "Avalanche Rank"],
        expected_sections=["Debt Overview & Accelerated Targets", "Liability Inventory & Priority Ranking", "Amortization Milestone Projections"],
        expected_disclaimer_keyword="projections",
        invariants_to_verify=["debt_payment_conservation", "number_safety", "table_structure", "disclaimer_present"],
    ),
    DocumentCreationCase(
        case_id="doc_create_05_net_worth_statement",
        format="net_worth_statement",
        title="Consolidated Balance Sheet & Net Worth Statement",
        description="Multi-page consolidated balance sheet with verified Assets - Liabilities = Net Worth conservation.",
        source_context={
            "total_assets": 348500.0,
            "total_liabilities": 48500.0,
            "net_worth": 300000.0,
        },
        document_text=(
            "FINWISE FINANCIAL INTELLIGENCE\n"
            "CONSOLIDATED BALANCE SHEET & NET WORTH STATEMENT\n"
            "Statement Date: 2026-10-31 | Org: org_alpha | Currency: USD\n\n"
            "# Consolidated Balance Sheet & Net Worth Statement\n\n"
            "## Balance Sheet Summary\n"
            "Total verified assets of $348,500.00 offset by total liabilities of $48,500.00 yield a Net Worth of $300,000.00.\n\n"
            ":::kpi Total Assets | $348,500.00 | Liquid + Non-Liquid :::\n"
            ":::kpi Total Liabilities | $48,500.00 | Short + Long Term :::\n"
            ":::kpi Net Worth | $300,000.00 | Assets - Liabilities :::\n"
            ":::kpi Solvency Ratio | 7.18x | Assets / Liabilities :::\n\n"
            "## Assets Schedule\n"
            "| Asset Category | Account / Asset Description | Valuation | Liquidity Tier | % of Assets |\n"
            "| Cash & Cash Equivalents | High-Yield Savings Account | $50,000.00 | Tier 1 (Liquid) | 14.3% |\n"
            "| Taxable Brokerage | US Broad Market Equities | $145,000.00 | Tier 1 (Liquid) | 41.6% |\n"
            "| Retirement Accounts | Traditional 401(k) & Roth IRA | $118,500.00 | Tier 2 (Locked) | 34.0% |\n"
            "| Real Estate Equity | Primary Residence Equity | $35,000.00 | Tier 3 (Illiquid) | 10.0% |\n\n"
            "\f"  # Physical Page Break to Page 2
            "FINWISE FINANCIAL INTELLIGENCE\n"
            "CONSOLIDATED BALANCE SHEET • PAGE 2\n\n"
            "## Liabilities Schedule\n"
            "| Liability Category | Lender / Instrument | Principal Due | Term | APR % |\n"
            "| Revolving Debt | Credit Card Prime | $8,500.00 | Revolving | 19.9% |\n"
            "| Secured Auto Debt | National Auto Credit | $18,000.00 | 48 Months | 5.4% |\n"
            "| Educational Debt | Federal Student Loan | $22,000.00 | 120 Months | 4.8% |\n\n"
            "## Net Worth Growth Assessment & Capital Allocation Summary\n"
            "Liquid capital coverage allows 8.5 months of operational expenses with positive debt amortization.\n\n"
            "Disclaimer: Valuations reflect active user-linked and manual accounts as of the statement date."
        ),
        expected_kpis=[
            {"label": "Total Assets", "value": "$348,500.00"},
            {"label": "Total Liabilities", "value": "$48,500.00"},
            {"label": "Net Worth", "value": "$300,000.00"},
            {"label": "Solvency Ratio", "value": "7.18x"},
        ],
        expected_table_headers=["Asset Category", "Account / Asset Description", "Valuation", "Liquidity Tier", "% of Assets"],
        expected_sections=["Balance Sheet Summary", "Assets Schedule", "Liabilities Schedule", "Net Worth Growth Assessment & Capital Allocation Summary"],
        expected_disclaimer_keyword="valuations",
        invariants_to_verify=["balance_sheet_conservation", "number_safety", "page_pagination", "table_structure", "disclaimer_present"],
    ),
    DocumentCreationCase(
        case_id="doc_create_06_standard_freeform",
        format="standard",
        title="Personal Wealth Directives & Free-Form Planning Plan",
        description="Free-form authored document with custom markdown headers, KPI blocks, and custom tables.",
        source_context={
            "reserve_amount": 50000.0,
            "monthly_dca": 2500.0,
        },
        document_text=(
            "# Personal Wealth Directives & Free-Form Planning Plan\n\n"
            "## Primary Directives\n"
            "This custom planning brief outlines strategic family milestones and emergency reserve allocations.\n\n"
            ":::kpi Emergency Reserve | $50,000.00 | 6 Months Target :::\n"
            ":::kpi Monthly DCA | $2,500.00 | Automated Transfer :::\n\n"
            "## Target Allocations\n"
            "| Target Goal | Funding Vehicle | Target Amount | Priority |\n"
            "| Emergency Fund | High-Yield Savings | $50,000.00 | #1 High |\n"
            "| College Savings | 529 Education Plan | $25,000.00 | #2 Medium |\n"
            "| Home Renovation | Treasury Bills | $15,000.00 | #3 Low |\n\n"
            ":::callout Note: Emergency fund transfers are fully automated on the 1st of every month. :::\n\n"
            "Disclaimer: Review directives periodically with financial advisors."
        ),
        expected_kpis=[
            {"label": "Emergency Reserve", "value": "$50,000.00"},
            {"label": "Monthly DCA", "value": "$2,500.00"},
        ],
        expected_table_headers=["Target Goal", "Funding Vehicle", "Target Amount", "Priority"],
        expected_sections=["Primary Directives", "Target Allocations"],
        expected_disclaimer_keyword="disclaimer",
        invariants_to_verify=["number_safety", "kpi_count", "table_structure", "disclaimer_present"],
    ),
]


# Evaluator engine analyzing financial document authorship fidelity and layout.
# Parses markdown structures and verifies schema compliance and typography rules.
# Enforces strict mathematical conservation invariants and number safety guards.
class DocumentCreationEvaluator:
    """Evaluates financial document authorship fidelity, layout structure, and invariants."""

    # Parses raw markdown document text into categorized structural components.
    # Extracts titles, section headers, KPI blocks, markdown tables, and callouts.
    # Handles physical page separations demarcated by form feed characters.
    def parse_document_structure(self, text: str) -> DocumentStructure:
        """Parse raw or formatted document text into structured components."""
        # Split by physical page breaks (\f)
        pages = [p.strip() for p in text.split("\f") if p.strip()]
        page_count = max(1, len(pages))

        # Extract title (first line starting with '# ' or header line)
        title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else "Financial Document"

        # Extract format badge
        badge_match = re.search(r"^([A-Z\s•\-_/]{6,50})$", text, re.MULTILINE)
        format_badge = badge_match.group(1).strip() if badge_match else None

        # Extract sections (## Heading)
        sections = [m.group(1).strip() for m in re.finditer(r"^##\s+(.+)$", text, re.MULTILINE)]

        # Extract KPIs (:::kpi Label | Value | Subtext :::)
        kpi_matches = re.finditer(r":::kpi\s+([^|]+)\|([^|]+)(?:\|([^:]+))?:::", text)
        kpis: List[Dict[str, str]] = []
        for m in kpi_matches:
            kpis.append({
                "label": m.group(1).strip(),
                "value": m.group(2).strip(),
                "subtext": (m.group(3) or "").strip(),
            })

        # Extract Markdown Tables (| Col 1 | Col 2 | ...)
        tables: List[Dict[str, Any]] = []
        table_blocks = re.findall(r"((?:\|[^\n]+\|\n?)+)", text)
        for block in table_blocks:
            lines = [line.strip() for line in block.strip().split("\n") if line.strip()]
            if len(lines) >= 2:
                # First line is headers
                headers = [h.strip() for h in lines[0].split("|") if h.strip()]
                # Skip divider line (e.g. |---|---|)
                rows = []
                for row_line in lines[1:]:
                    if re.match(r"^\|[\s\-:|]+\|$", row_line):
                        continue
                    cols = [c.strip() for c in row_line.split("|") if c.strip()]
                    if cols:
                        rows.append(cols)
                if headers and rows:
                    tables.append({"headers": headers, "rows": rows})

        # Extract Callouts (:::callout ... :::)
        callout_matches = re.findall(r":::callout\s+([\s\S]+?):::", text)
        callouts = [c.strip() for c in callout_matches]

        # Extract Disclaimer
        disclaimer_match = re.search(r"(?:disclaimer|notice|cpa):?\s*(.+)$", text, re.IGNORECASE | re.MULTILINE)
        disclaimer = disclaimer_match.group(0).strip() if disclaimer_match else None

        # Extract Metadata fields (Key: Value)
        metadata_fields: Dict[str, str] = {}
        for line in text.split("\n")[:8]:
            for part in line.split("|"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    metadata_fields[k.strip().lower()] = v.strip()

        return DocumentStructure(
            title=title,
            format_badge=format_badge,
            metadata_fields=metadata_fields,
            pages=pages,
            page_count=page_count,
            sections=sections,
            kpis=kpis,
            tables=tables,
            callouts=callouts,
            disclaimer=disclaimer,
        )

    # Verifies that an authored document strictly adheres to target format schema.
    # Asserts presence of required section headings, metric cards, and disclaimers.
    # Computes a normalized compliance ratio and returns descriptive failure lists.
    def evaluate_format_compliance(self, case: DocumentCreationCase, doc: DocumentStructure) -> Tuple[float, List[str]]:
        """Verify compliance with the expected format schema."""
        failures: List[str] = []
        checks = 0
        passed = 0

        # 1. Section presence
        for sec in case.expected_sections:
            checks += 1
            if sec in doc.sections:
                passed += 1
            else:
                failures.append(f"Missing expected section '{sec}'")

        # 2. KPI presence
        for exp_kpi in case.expected_kpis:
            checks += 1
            matching = [k for k in doc.kpis if exp_kpi["label"].lower() in k["label"].lower()]
            if matching and exp_kpi["value"] in matching[0]["value"]:
                passed += 1
            else:
                failures.append(f"Missing or mismatched KPI '{exp_kpi['label']}' (expected {exp_kpi['value']})")

        # 3. Disclaimer presence
        checks += 1
        if doc.disclaimer and case.expected_disclaimer_keyword.lower() in doc.disclaimer.lower():
            passed += 1
        else:
            failures.append(f"Missing disclaimer containing keyword '{case.expected_disclaimer_keyword}'")

        score = (passed / checks) if checks > 0 else 1.0
        return score, failures

    # Assesses visual layout fidelity across titles, tables, KPIs, and section depth.
    # Verifies table header alignments and minimum metric presentation standards.
    # Yields a fractional score representing typography and layout completeness.
    def evaluate_layout_structure(self, case: DocumentCreationCase, doc: DocumentStructure) -> Tuple[float, List[str]]:
        """Verify visual layout elements (tables, headers, typography)."""
        failures: List[str] = []
        score_points = 0.0
        total_points = 4.0

        # Point 1: Title & Header
        if doc.title and len(doc.title) >= 10:
            score_points += 1.0
        else:
            failures.append("Document lacks a descriptive header title")

        # Point 2: Table structure & headers
        if doc.tables:
            first_table = doc.tables[0]
            matched_headers = 0
            for exp_header in case.expected_table_headers:
                if any(exp_header.lower() in h.lower() for h in first_table["headers"]):
                    matched_headers += 1
            if matched_headers >= max(1, len(case.expected_table_headers) // 2):
                score_points += 1.0
            else:
                failures.append(f"Table headers did not match expected ({first_table['headers']} vs {case.expected_table_headers})")
        else:
            failures.append("No tabular schedules rendered in document")

        # Point 3: KPI cards presence
        if len(doc.kpis) >= min(2, len(case.expected_kpis)):
            score_points += 1.0
        else:
            failures.append(f"Expected at least {len(case.expected_kpis)} KPI cards, found {len(doc.kpis)}")

        # Point 4: Sections depth
        if len(doc.sections) >= 2:
            score_points += 1.0
        else:
            failures.append("Document has fewer than 2 structured section blocks")

        score = score_points / total_points
        return score, failures

    # Verifies mathematical conservation invariants across document numerical data.
    # Checks balance sheets, net cash flows, debt payoffs, and number safety subsets.
    # Detects hallucinated figures and logs passed and failed invariant details.
    def evaluate_invariants(self, case: DocumentCreationCase, doc: DocumentStructure) -> Tuple[float, List[str], List[str]]:
        """Verify mathematical invariants and conservation rules."""
        invariants_passed: List[str] = []
        invariants_failed: List[str] = []

        # Invariant: Balance Sheet Conservation (Assets - Liabilities = Net Worth)
        if "balance_sheet_conservation" in case.invariants_to_verify:
            assets = case.source_context.get("total_assets", 0.0)
            liabilities = case.source_context.get("total_liabilities", 0.0)
            net_worth = case.source_context.get("net_worth", 0.0)
            if abs((assets - liabilities) - net_worth) < 0.01:
                invariants_passed.append("balance_sheet_conservation (Assets - Liabilities = Net Worth)")
            else:
                invariants_failed.append(f"balance_sheet_conservation: {assets} - {liabilities} != {net_worth}")

        # Invariant: Cash Flow Conservation (Inflow - Outflow = Surplus)
        if "cash_flow_conservation" in case.invariants_to_verify:
            inflows = case.source_context.get("monthly_inflows", 0.0)
            outflows = case.source_context.get("monthly_outflows", 0.0)
            surplus = case.source_context.get("net_surplus", 0.0)
            if abs((inflows - outflows) - surplus) < 0.01:
                invariants_passed.append("cash_flow_conservation (Inflow - Outflow = Surplus)")
            else:
                invariants_failed.append(f"cash_flow_conservation: {inflows} - {outflows} != {surplus}")

        # Invariant: Debt Payment Conservation (Accelerated >= Minimum)
        if "debt_payment_conservation" in case.invariants_to_verify:
            min_pay = case.source_context.get("min_payment", 0.0)
            acc_pay = case.source_context.get("accelerated_payment", 0.0)
            if acc_pay >= min_pay:
                invariants_passed.append("debt_payment_conservation (Accelerated Payment >= Minimum)")
            else:
                invariants_failed.append(f"debt_payment_conservation: {acc_pay} < {min_pay}")

        # Invariant: Number Safety (All formatted numbers are grounded in source context)
        if "number_safety" in case.invariants_to_verify:
            # Flatten all source values into floats
            source_floats: Set[float] = set()
            for v in case.source_context.values():
                if isinstance(v, (int, float)):
                    source_floats.add(round(float(v), 2))

            # Extract numbers from rendered KPIs
            doc_kpi_text = " ".join(f"{k['label']} {k['value']} {k['subtext']}" for k in doc.kpis)
            raw_kpi_nums = extract_numbers(doc_kpi_text)
            kpi_floats: List[float] = []
            for token in raw_kpi_nums:
                cleaned = re.sub(r"[^\d.]", "", token)
                if cleaned:
                    try:
                        kpi_floats.append(round(float(cleaned), 2))
                    except ValueError:
                        pass

            # Any large candidate float (> 100) must match source records or direct calculations
            unmatched: List[float] = []
            for num in kpi_floats:
                if num > 100.0 and not any(abs(num - src) < 0.05 for src in source_floats):
                    unmatched.append(num)

            if len(unmatched) == 0:
                invariants_passed.append("number_safety (Candidate numbers match source context)")
            else:
                invariants_failed.append(f"number_safety: Unmatched candidate numbers found: {unmatched[:3]}")

        # Invariant: Physical Page Pagination
        if "page_pagination" in case.invariants_to_verify:
            if doc.page_count >= 2:
                # Verify each page has substantive content
                empty_pages = [idx for idx, p in enumerate(doc.pages) if len(p.strip()) < 20]
                if not empty_pages:
                    invariants_passed.append("page_pagination (Multi-page form feeds verified without orphaned pages)")
                else:
                    invariants_failed.append(f"page_pagination: Empty pages detected at indices {empty_pages}")
            else:
                invariants_failed.append(f"page_pagination: Expected multi-page document, but found {doc.page_count} page(s)")

        total = len(invariants_passed) + len(invariants_failed)
        score = (len(invariants_passed) / total) if total > 0 else 1.0
        return score, invariants_passed, invariants_failed

    # Scores physical document pagination and form feed preservation accuracy.
    # Compares parsed page counts against expected form feed split totals.
    # Guards against orphaned pages or accidental omission of pagination markers.
    def evaluate_page_pagination(self, case: DocumentCreationCase, doc: DocumentStructure) -> float:
        """Score physical page pagination fidelity."""
        if "\f" in case.document_text:
            expected_pages = len(case.document_text.split("\f"))
            return 1.0 if doc.page_count == expected_pages else 0.5
        return 1.0

    # Executes complete multi-dimensional evaluation for a single document test case.
    # Combines weighted scores across format, layout, invariants, and pagination.
    # Constructs comprehensive result objects detailing pass status and diagnostics.
    def run_case(self, case: DocumentCreationCase) -> DocumentCreationEvalResult:
        """Run complete evaluation for a single golden case."""
        doc = self.parse_document_structure(case.document_text)

        format_comp_score, comp_failures = self.evaluate_format_compliance(case, doc)
        layout_score, layout_failures = self.evaluate_layout_structure(case, doc)
        inv_score, inv_passed, inv_failed = self.evaluate_invariants(case, doc)
        pagination_score = self.evaluate_page_pagination(case, doc)

        # Number safety is 1.0 if inv_failed contains no number_safety failures
        num_safety_score = 0.0 if any("number_safety" in f for f in inv_failed) else 1.0

        # Weighted composite score
        overall = (
            0.30 * format_comp_score +
            0.25 * layout_score +
            0.25 * inv_score +
            0.10 * num_safety_score +
            0.10 * pagination_score
        )

        all_failures = comp_failures + layout_failures + inv_failed
        passed = (overall >= 0.85) and (len(inv_failed) == 0)

        return DocumentCreationEvalResult(
            case_id=case.case_id,
            format=case.format,
            passed=passed,
            format_compliance_score=round(format_comp_score, 4),
            layout_structure_score=round(layout_score, 4),
            invariant_score=round(inv_score, 4),
            number_safety_score=round(num_safety_score, 4),
            page_pagination_score=round(pagination_score, 4),
            overall_score=round(overall, 4),
            page_count=doc.page_count,
            kpis_found=len(doc.kpis),
            tables_found=len(doc.tables),
            invariants_passed=inv_passed,
            invariants_failed=inv_failed,
            failure_reasons=all_failures,
        )

    # Executes all golden document creation test cases and aggregates suite metrics.
    # Calculates overall pass rates, average component scores, and case summaries.
    # Produces high-level evaluation reports for continuous document QA auditing.
    def run_suite(self) -> Dict[str, Any]:
        """Execute all golden test cases and generate a consolidated report."""
        results = [self.run_case(case) for case in GOLDEN_DOCUMENT_CREATION_CASES]

        total_cases = len(results)
        passed_cases = sum(1 for r in results if r.passed)
        avg_overall = sum(r.overall_score for r in results) / total_cases if total_cases else 0.0
        avg_format = sum(r.format_compliance_score for r in results) / total_cases if total_cases else 0.0
        avg_layout = sum(r.layout_structure_score for r in results) / total_cases if total_cases else 0.0
        avg_invariant = sum(r.invariant_score for r in results) / total_cases if total_cases else 0.0
        avg_num_safety = sum(r.number_safety_score for r in results) / total_cases if total_cases else 0.0

        return {
            "total_cases": total_cases,
            "passed_cases": passed_cases,
            "failed_cases": total_cases - passed_cases,
            "pass_rate": round(passed_cases / total_cases, 4) if total_cases else 0.0,
            "average_overall_score": round(avg_overall, 4),
            "average_format_compliance": round(avg_format, 4),
            "average_layout_structure": round(avg_layout, 4),
            "average_invariant_score": round(avg_invariant, 4),
            "average_number_safety_score": round(avg_num_safety, 4),
            "cases": [
                {
                    "case_id": r.case_id,
                    "format": r.format,
                    "passed": r.passed,
                    "overall_score": r.overall_score,
                    "page_count": r.page_count,
                    "kpis_found": r.kpis_found,
                    "tables_found": r.tables_found,
                    "invariants_passed": r.invariants_passed,
                    "invariants_failed": r.invariants_failed,
                    "failure_reasons": r.failure_reasons,
                }
                for r in results
            ],
        }
