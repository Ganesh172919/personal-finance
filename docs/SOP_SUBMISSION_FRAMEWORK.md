# Statement of Purpose (SOP) Submission Framework

## Overview

All registered students are required to submit a Statement of Purpose (SOP) in **PDF format**. The SOP should be **within 500 words**. This document outlines the framework and guidelines for SOP submission.

---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Submission Requirements

| Requirement | Details |
|-------------|---------|
| **Format** | PDF only (.pdf) |
| **Word Limit** | Maximum 500 words |
| **File Naming** | `SOP_YourName_StudentID.pdf` |
| **Submission Portal** | To be communicated to shortlisted participants |

---

## SOP Structure

Students must address the following sections in their SOP:

### 1. Introduction (50-75 words)
- Brief introduction about yourself
- Your current academic background and institution
- Your area of study/specialization

### 2. Motivation (100-125 words)
- Why are you interested in this Personal Finance project?
- What drew you to the intersection of technology and finance?
- How does this project align with your career aspirations?

### 3. Relevant Skills & Experience (100-125 words)
- Technical skills you bring (programming, data analysis, AI/ML, etc.)
- Previous projects or experiences related to finance or technology
- Any certifications, courses, or achievements relevant to this domain

### 4. Project Understanding (100-125 words)
- Demonstrate your understanding of the FinWise platform
- Which features or components interest you most?
- How do you envision AI-powered personal finance tools transforming financial literacy?

### 5. Learning Objectives & Contribution (100-125 words)
- What do you hope to learn from this project?
- How will you contribute to the team?
- What unique perspective or skills will you bring?

### 6. Conclusion (50 words)
- Summarize your enthusiasm and commitment
- Your availability and dedication to the project

---

## Evaluation Criteria

SOPs will be evaluated based on:

| Criteria | Weightage |
|----------|-----------|
| Clarity of thought and writing | 20% |
| Understanding of the project domain | 25% |
| Relevant skills and experience | 25% |
| Motivation and career alignment | 15% |
| Originality and authenticity | 15% |

---

## Tips for a Strong SOP

1. **Be Authentic** — Write in your own voice; avoid generic templates
2. **Be Specific** — Reference specific features of FinWise (multi-agent AI, budgeting tools, etc.)
3. **Show, Don't Tell** — Use examples from your experience rather than vague claims
4. **Stay Within Limit** — Adhere strictly to the 500-word limit
5. **Proofread** — Check for grammar, spelling, and formatting errors
6. **Be Concise** — Every sentence should add value

---

## Important Dates

| Milestone | Date |
|-----------|------|
| SOP Submission Deadline | To be announced |
| Shortlisting Results | To be announced |
| Framework Communication | To shortlisted participants only |

---

## Academic Integrity

- SOP must be entirely your own work
- Plagiarism or use of AI-generated content without disclosure will result in disqualification
- All submissions will be checked for originality

---

## Contact

For queries regarding SOP submission, please reach out through the official communication channels provided during registration.

---

*This framework will be communicated to shortlisted participants at a later stage. Registered students are advised to prepare their SOPs following these guidelines.*

## SOP Submission Framework & Evaluation Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#059669', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#047857', 'lineColor': '#8b5cf6', 'secondaryColor': '#0284c7', 'tertiaryColor': '#f59e0b'}}}%%
mindmap
  root((📋 SOP Submission Guide))
    📝 Content Structure
      Background & Technical Skillset
      Motivation for FinWise Participation
      Target Contribution Domain
      Long-Term Professional Vision
    📏 Formatting Requirements
      Word Limit: Strictly <= 500 words
      Document Format: Single PDF export
      Filename convention: SOP_[CandidateID]_[Name].pdf
    📊 Evaluation Rubric
      Domain Understanding (30%)
      Technical Competency (30%)
      Project Alignment & Impact (25%)
      Clarity & Communication (15%)
    🔒 Integrity & Authenticity
      Plagiarism screening
      Verification of claimed technical repositories
```

## SOP Submission & Evaluation Lifecycle ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 STAGE 1: DRAFTING ACCORDING TO GUIDELINES                           │
│    Follow framework sections: Profile ➔ Motivation ➔ Contribution      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🔍 STAGE 2: PRE-SUBMISSION COMPLIANCE CHECK                            │
│    ├─► Verify word count <= 500 words                                  │
│    ├─► Convert document to clean PDF using generator script            │
│    └─► Confirm naming: SOP_FinWise_Applicant.pdf                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🚀 STAGE 3: PORTAL UPLOAD & RECEIPT CONFIRMATION                       │
│    ├─► Upload to official evaluation portal                            │
│    ├─► Automated checksum & format verification pass                   │
│    └─► Review committee conducts rubric evaluation & shortlisting 🟢   │
└────────────────────────────────────────────────────────────────────────┘
```


---

## Automated SOP PDF Generator CLI (`server/src/scripts/generateSOPPdf.ts`)

Students and maintainers can compile the formal SOP PDF artifact directly from source:

```typescript
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSOPFrameworkPdf(): void {
  const doc = new PDFDocument({ size: "A4", margin: 54 });
  const outputPath = path.join(__dirname, "../../../docs/SOP_Submission_Framework.pdf");

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(22).fillColor("#111827").text("Statement of Purpose (SOP)", { align: "center" });
  doc.fontSize(16).fillColor("#4b5563").text("Submission Framework", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#6b7280").text("FinWise - AI-Powered Personal Finance Platform", { align: "center" });
  doc.moveDown(1);

  // Compile layout and stream to disk
  doc.end();
}
```

### Execution Command:
```bash
# From server directory
cd server
npx tsx src/scripts/generateSOPPdf.ts
```
