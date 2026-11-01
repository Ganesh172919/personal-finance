# FinWise AI Evidence UX Guide

This document describes the current evidence-related AI payloads and proposes a
better UX for them.

The goal is not to redesign the AI system from scratch. It is to make the
existing grounded-output signals more visible, more understandable, and more
trustworthy to users.

Update, 2026-10-28: `SourceEvidenceList` now renders evidence in chat and file
analysis. Retrieved passages appear first, every source remains available via
Show all, and file references open `/files?file=<id>&page=<physical-page>`.
Only validated file IDs and explicit positive integral `page_number` metadata
produce page links. Old evidence keeps working without guessing pages from its
label. File review retains its selection on refresh and explains unavailable
extracted pages. The recommendations below remain a roadmap for other surfaces.

## 1. Existing signal surfaces

The codebase already carries several trust-oriented AI signals:

- `evidence`
- `confidence`
- `suggested_actions`
- `workflow_trace`
- `fallback_used`
- `recovered_from_checkpoint`

These appear in server responses and are already typed on the client side.

## 2. Where the current UI already uses them

### Chat messages

Based on `client/src/features/chat/ChatMessage.tsx`, assistant messages already
render:

- a grounding confidence block
- an evidence used block
- a suggested next actions block
- an autopilot actions block

This is a strong start, but the current presentation is intentionally light.

### Conversation insights

Based on `client/src/components/ConversationInsightsPanel.tsx`, the product
also surfaces:

- fallback state
- agent involvement
- summarized next moves

### Workflow trace

The client already has workflow trace data and a dedicated visualizer path,
which means explainability is not blocked by missing transport fields.

## 3. UX gap summary

Today, the system has better grounding metadata than the UI consistently
communicates.

Main gaps:

- evidence is shown, but not deeply navigable
- confidence is shown, but coverage is not visualized richly
- users cannot easily distinguish summary evidence from direct document
  citations
- fallback and degraded-mode behaviors are not always obvious enough

## 4. UX goals

The AI UX should help users answer:

1. What information did the assistant use?
2. How complete was the evidence?
3. How much should I trust this recommendation?
4. What should I do next?

## 5. Recommended interface patterns

### A. Confidence card

Keep:

- confidence label
- numeric score
- short notes

Add:

- mini coverage breakdown from `confidence.coverage`
- better distinction between high, medium, and low coverage
- explicit "missing data" phrasing when important sources are absent

### B. Evidence list

Keep:

- item label
- supporting snippet

Add:

- source type badge such as `file`, `memory`, `task`, `budget`, `recurring`
- click target to open the related entity where possible
- pagination or expansion for more than a few evidence items

### C. Retrieval-aware citations

When RAG is added, evidence items should distinguish:

- general grounding evidence
- direct retrieved citations

Suggested visual treatment:

- "Grounding evidence" section
- "Quoted sources" or "Retrieved sources" section

### D. Workflow transparency

For agentic outputs:

- keep the workflow trace visualizer
- show degraded states clearly when fallback happened
- expose which agent or phase produced the final recommendation

## 6. Copy guidelines

Good AI evidence UX should use plain language.

Prefer:

- "The assistant used these sources"
- "Coverage is limited because recent files were not available"
- "This answer used fallback logic instead of a full AI run"

Avoid:

- opaque internal terms
- overconfident wording when evidence is weak
- exposing internal-only jargon without explanation

## 7. Proposed metadata distinctions

The current metadata can support a better UI with only small extensions.

Suggested distinctions:

- `evidence.type`: source family
- `evidence.label`: human-readable item
- `evidence.snippet`: why it mattered
- future retrieval fields:
  - `workspace_file_id`
  - `chunk_index`
  - `page_number`
  - `retrieval_score`

## 8. UX states to support

### High-confidence grounded answer

Show:

- green or positive confidence treatment
- multiple evidence items
- strong action suggestions if applicable

### Medium-confidence answer

Show:

- neutral treatment
- missing-source caveat
- optional prompt suggesting the user upload a file or complete setup

### Low-confidence or fallback answer

Show:

- visible caution state
- direct explanation that the answer may be generic
- recommended next step to improve grounding

## 9. Best next UI improvements

These are the most practical near-term improvements given the current code:

1. Render `confidence.coverage` in a compact structured form.
2. Add clearer badges for evidence item types.
3. Make evidence items navigable when an entity id exists.
4. Differentiate fallback responses visually.
5. Prepare the component structure for retrieval citations.

## 10. Why this matters

FinWise is finance software, not a generic chatbot. Trust, provenance, and
clarity matter more here than novelty. A strong evidence UX can improve both
user confidence and product quality without requiring a full model change.

## 11. Companion docs

- `docs/RAG_IMPLEMENTATION_PLAN.md`
- `docs/RETRIEVAL_DATA_MODEL_SPEC.md`
- `docs/INNOVATION_ROADMAP.md`

## AI Evidence & Provenance UX Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#059669', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#047857', 'lineColor': '#8b5cf6', 'secondaryColor': '#0284c7', 'tertiaryColor': '#f59e0b'}}}%%
mindmap
  root((🔎 AI Evidence & Trust UX))
    🎯 Confidence Indicators
      High Confidence (>=85% - Green verified shield)
      Moderate Confidence (60-84% - Amber context caution)
      Low / Rule Fallback (<60% - Visible heuristic warning)
    📄 Citation & Source Cards
      Document Source Link (File name & page number)
      Exact Text Snippet & Bounding Box Preview
      Calculation Formula & Parameter Derivation
      Last Verified Freshness Timestamp
    🧩 Interactive UI Widgets
      Inline Citation Number Pills [1], [2]
      Expandable Evidence Drawer & Trace Tree
      One-Click Source Inspection Dialog
      User Correction & Feedback Override
```

## AI Grounding Verification & Interactive Evidence ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 USER SUBMITS FINANCIAL QUERY                                        │
│    "Why is my food & dining budget exceeded this month?"               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧠 STAGE 1: AI CORE EVIDENCE COMPILATION                               │
│    ├─► MasterAgent queries Grounding & Retrieval Service               │
│    ├─► Attached Evidence:                                              │
│    │   ├─ [1] Transaction Ledger: 14 restaurant charges ($842 total)   │
│    │   ├─ [2] Budget Limit: Food category cap ($600 limit)             │
│    │   └─ [3] Receipt Scan: Grocery run at Trader Joe's ($184)         │
│    └─► Calculate Coverage Score: 94% (High Confidence) 🟢              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🎨 STAGE 2: CLIENT CITATION & BADGE RENDERING                          │
│    ├─► Render Response Message with Green "Verified Grounding" badge   │
│    ├─► Embed clickable inline citation pills: [1], [2], [3]            │
│    └─► Display Summary Callout: "Over budget by $242 (+40.3%)"         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🔍 STAGE 3: INTERACTIVE USER DRILL-DOWN                                │
│    User clicks citation [1] ──► Opens Slide-Over Evidence Drawer       │
│    ├─► Lists all 14 underlying transactions with direct filters        │
│    └─► Allows user to re-categorize or dispute any anomaly directly 🟢 │
└────────────────────────────────────────────────────────────────────────┘
```


---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Production Implementation Blueprint: Interactive Citation Pill Component (`client/src/components/CitationPill.tsx`)

```typescript
import React from "react";
import { ExternalLink, FileText } from "lucide-react";

interface CitationPillProps {
  citationIndex: number;
  filename: string;
  pageNumber: number;
  groundingScore: number;
  onClick: () => void;
}

export const CitationPill: React.FC<CitationPillProps> = ({
  citationIndex,
  filename,
  pageNumber,
  groundingScore,
  onClick,
}) => {
  const isHighConfidence = groundingScore >= 0.70;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 my-1 mx-1 text-xs font-medium rounded-full transition-colors border ${
        isHighConfidence
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
          : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
      }`}
      title={`Grounding confidence: ${(groundingScore * 100).toFixed(1)}%`}
    >
      <FileText className="w-3 h-3" />
      <span>[{citationIndex}] {filename} (p. {pageNumber})</span>
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </button>
  );
};
```