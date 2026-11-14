# The Great Indian AI Internship Challenge — Official Project Submission

> **Participant:** J Ganesh Kumar Reddy  
> **Challenge:** The Great Indian AI Internship Challenge 2026  
> **Hosted by:** Gnani.ai (`hello@gnani.biz` / `app.gnani.ai`)  
> **Submission Deadline:** November 15, 2026 at 6:00 p.m. IST · [Official submission form](https://forms.cloud.microsoft/r/dfFShbp7W7)  
> **Project Name:** **FinWise Bharat Voice — Indic Voice-First Autonomous Financial Operating System**  
> **Technology Stack:** Gnani AI Prisma v3.0 (STT) · Gnani AI Timbre (TTS) · Gnani AI Evon v3.3 (30B Reasoning LLM) · React 18 · Express 5 · Python FastAPI · MongoDB 7.0  

---

## 1. Executive Summary

**FinWise Bharat Voice** is an Indic voice-first financial operating system built specifically for the next 500 million internet users in Bharat. While modern consumer finance applications remain bound to English desktop spreadsheets and complex navigation hierarchies, the reality of Indian commerce is **voice-driven, informal, and multilingual**.

FinWise integrates Prisma v3.0 for transcription, an optional Evon deployment for expense extraction, and Timbre for spoken confirmation. Users can correct a transcript, check the amount, and see what the expense would leave in the monthly category budget before saving to their ledger.

---

## 2. Practical Need & Problem Statement

### The Problem in Bharat
1. **The Language Barrier**: Over 85% of India does not speak English as a primary language. Complex financial terms like *"amortization"*, *"unreconciled liabilities"*, or *"statutory deductions"* create fear and disengagement.
2. **The Code-Mixed Reality**: Indians speak in **Hinglish, Kanglish, and Tanglish** (e.g., *"Maine aaj Sharma ji ki kirana dukan pe 450 rupaye rashan ke liye UPI se diye"*). Conventional speech engines fail on code-mixed phonemes and colloquial Indian financial vernacular.
3. **Noisy Street & Telephonic Environments**: Kirana merchants, auto drivers, students, and gig workers log expenses on the move over noisy telephone calls or street traffic with background noise and 8kHz bandwidth limitations.
4. **Hallucination Risk in LLMs**: Generic large language models frequently invent arithmetic totals or hallucinate transaction balances.

### The FinWise Solution
FinWise solves this through a **hybrid deterministic-AI architecture**:
- **Gnani Prisma v3.0 STT** captures multilingual speech with high accuracy across 12+ Indic languages and 8kHz telephonic audio.
- **Gnani Evon 30B Reasoning** decomposes the transcribed utterance into structured financial entities (`amount`, `category`, `merchant`, `paymentMethod`, `currency`).
- **Deterministic Number Safety Invariant**: Every rupee is verified by pure TypeScript calculators before committing to the MongoDB ledger.
- **Gnani Timbre TTS** synthesizes natural regional voice responses, speaking back confirmation in the user's native tongue.

---

## 3. Gnani AI Models & APIs Integrated

| Gnani Model | Role in FinWise | Key Capabilities Implemented |
| :--- | :--- | :--- |
| **Prisma v3.0** *(Speech-to-Text)* | Spoken audio transcription in Chat & FinanceOS | 12+ Indic languages, code-mixed Hinglish recognition, 8kHz telephonic noise cancellation mode, Web Audio volume visualizer |
| **Timbre** *(Text-to-Speech, beta)* | Spoken financial confirmations & AI response read-aloud | Regional voice synthesis (Hindi, Telugu, Tamil, Indian English), expressive tones, customizable speech rate and pitch |
| **Evon v3.3** *(30B Reasoning LLM)* | First-class reasoning provider in Python AI Core | Complex Indic financial reasoning, intent parsing, semantic expense extraction, UPI/Kirana merchant entity mapping |

Prisma and Timbre use the published Gnani speech APIs. Evon requires an explicitly configured OpenAI-compatible deployment. The app uses deterministic finance logic when no Evon endpoint is configured. Offline speech tests use simulated transcripts and synthesized WAV fixtures. Biometrics, grievance routing, compliance indicators, and benchmark examples are demonstrations.

---

## 4. Award Categories Relevant to FinWise

FinWise demonstrates the following use cases for The Great Indian AI Internship Challenge.

1. **Regional Languages (₹50,000)**: Full native script and phoneme support across 12 Indic languages: हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, मराठी, বাংলা, ગુજરાતી, മലയാളം, ਪੰਜਾਬੀ, ଓଡ଼ିଆ, and Indian English.
2. **Hinglish & Code-Mixed Voice Experiences (₹50,000)**: Built-in token normalizer specifically tuned for blended Indian English-Hindi phrases (e.g., *"Ordered dinner from Swiggy for 320 rupees using Paytm UPI"*).
3. **Noisy Telephonic Audio (₹50,000)**: Dedicated 8kHz telephonic bandpass filter and noise suppression toggle reproducing 300Hz–3400Hz telephone bandwidth with Prisma noise-robust ASR.
4. **Real-World Impact (₹50,000)**: Democratizes financial tracking for 500M+ Indians, micro-merchants, auto drivers, daily wage earners, and rural households.
5. **Solo Ninja Award (₹50,000)**: Engineered by J Ganesh Kumar Reddy with a React frontend, Express backend, and Python AI Core.
6. **Creativity (₹50,000)**: Fusion of multi-agent LangGraph topology with Indic voice I/O, mathematical number-safety guarantees, and instant voice-to-ledger commitment.
7. **Entries from Tier 2 and Tier 3 Towns (₹50,000)**: Tailored for local Kirana store operations, regional dialect variations, and low-latency local execution.
8. **Best 60-Second Demo (₹50,000)**: Electrifying 60-second video walkthrough (full script in Section 6).
9. **Public-Vote Crowd Favourite (₹50,000)**: Highly engaging LinkedIn and X viral post copy with interactive demo presets.

[Official award and eligibility rules](https://www.gnani.ai/internship)

---

## 5. End-to-End Architectural Flow

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🟢 PRESENTATION LAYER: React 18 + Vite (Port 5173)                                    │
│    ├─► 🎙️ Bharat Voice Assistant: Dual-Mode Cockpit (Expense Logging & Spoken Q&A)     │
│    ├─► ⏱️ In-App 60-Second Video Demo Teleprompter with Live Timer & Cues               │
│    ├─► 📞 Noisy Telephonic Filter (8kHz Bandpass) + Web Audio Market Noise Simulator   │
│    ├─► 🌐 Indic Dialect Selector (हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, मराठी, বাংলা)          │
│    └─► 💬 AI Chat Composer with Prisma STT Mic & Timbre TTS Voice Speaker Button       │
└─────────────────────────────────────────┬──────────────────────────────────────────────┘
                                          │ Audio Blob / Base64 Payload
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔷 API GATEWAY: Express 5 TypeScript (Port 3000)                                       │
│    ├─► POST /api/v1/voice/transcribe ──► Gnani Prisma v3.0 STT                        │
│    ├─► POST /api/v1/voice/synthesize ──► Gnani Timbre TTS                              │
│    ├─► POST /api/v1/voice/log-expense                                                  │
│    │      ├── 1. Prisma v3.0: Multilingual ASR (Code-mixed Hinglish & Telephonic)       │
│    │      ├── 2. Evon 30B: Structured Financial Reasoning (Amount, Merchant, Method)  │
│    │      ├── 3. MongoDB Ledger: Direct Commit with OrgScopePlugin Isolation          │
│    │      └── 4. Timbre TTS: Spoken Regional Voice Confirmation Audio                  │
│    ├─► POST /api/v1/voice/query (Conversational Voice Financial Copilot)              │
│    │      ├── 1. Prisma v3.0: Spoken Query Transcription                              │
│    │      ├── 2. Evon 30B: Financial Ledger Reasoning (Expenses, Income, Balances)    │
│    │      └── 3. Timbre TTS: Natural Regional Spoken Answer Synthesis                 │
│    ├─► POST /api/v1/voice/collections (BFSI Khata Debt & Micro-Merchant Collections)   │
│    │      ├── 1. Prisma v3.0: Spoken Credit/Udhar Note Transcription                  │
│    │      ├── 2. Evon 30B: Customer Name, Credit Terms & Due Date Extraction          │
│    │      └── 3. Timbre TTS: Localized Spoken WhatsApp Collection Reminder Synthesis  │
│    ├─► POST /api/v1/voice/lead-qualification (BFSI Mudra & MSME Underwriting)          │
│    │      ├── 1. Prisma v3.0: Spoken Loan Query Transcription                         │
│    │      ├── 2. Evon 30B: Business Turnover, DSCR Ratio & Scheme Recommendation       │
│    │      └── 3. Timbre TTS: Spoken Regional Pre-Qualification Decision Voice Audio     │
│    ├─► POST /api/v1/voice/dispute (BFSI UPI Dispute & Grievance Redressal)             │
│    │      ├── 1. Prisma v3.0: Spoken Failure / UTR Transcription                      │
│    │      ├── 2. Evon 30B: NPCI UDMS Integration, RBI T+1 TAT & ₹100/day Penalty Rule  │
│    │      └── 3. Timbre TTS: Reassuring Spoken Voice Reversal Confirmation              │
│    ├─► POST /api/v1/voice/tax-advisor (Spoken Bharat Tax & GST Copilot)                │
│    │      ├── 1. Prisma v3.0: Spoken Income & Deduction Query Transcription           │
│    │      ├── 2. Evon 30B: FY24-25 Budget 2024 Slabs, ₹75k Std Ded & Sec 87A Rebate    │
│    │      └── 3. Timbre TTS: Spoken Regional Optimal Regime Advice & Savings Audio      │
│    ├─► POST /api/v1/voice/billing (Autonomous Spoken Vyapar Billing & GST Invoicing)   │
│    │      ├── 1. Prisma v3.0: Spoken Multi-Item Basket Transcription                   │
│    │      ├── 2. Evon 30B: Line-Item Entity Extraction, Subtotal & CGST/SGST (18%)    │
│    │      └── 3. Timbre TTS: Spoken Bill Summary & Dynamic NPCI UPI QR Payment Link    │
│    ├─► POST /api/v1/voice/schemes (Jan Kalyan Government Schemes Voice Navigator)       │
│    │      ├── 1. Prisma v3.0: Spoken Citizen Occupation & Need Transcription           │
│    │      ├── 2. Evon 30B: PM SVANidhi, PM-KISAN, Sukanya Samriddhi & Ayushman Match   │
│    │      └── 3. Timbre TTS: Spoken Regional Eligibility Guidance & Direct Portal Link │
│    ├─► POST /api/v1/voice/biometrics/verify (Dedicated Voice Biometrics Liveness Gate) │
│    │      ├── 1. Prisma v3.0: Spoken Passphrase Acoustic Acquisition                   │
│    │      ├── 2. Voice Biometrics: Simulated voiceprint and liveness │
│    │      └── 3. Security Token: Short-lived Cryptographic HMAC Authorization Signing │
│    ├─► POST /api/v1/voice/assist (Real-Time Agent Assist & Telephony Simulator)        │
│    │      ├── 1. Gnani Assist: Next-Best-Action (NBA) Engine & Dynamic Battle Cards    │
│    │      ├── 2. 8kHz Telephony Codec: AMR-WB & G.711 Inbound/Outbound Call Simulator │
│    │      └── 3. Statutory Checkpoint: RBI Fair Practices Code Automated Compliance    │
│    └─► POST /api/v1/voice/analytics (Speech Acoustics, Sentiment & Biometrics Shield) │
│           ├── 1. Gnani Acoustics Engine: Local 8kHz filter and sample acoustic metrics        │
│           ├── 2. Sentiment Classifier: Tone, Urgency & Emotion Detection               │
│           └── 3. Voice Biometrics: Simulated voiceprint and liveness      │
└─────────────────────────────────────────┬──────────────────────────────────────────────┘
                                          │ Normalized JSON
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🧠 AI CORE: Python 3.11 FastAPI (Port 8001)                                            │
│    ├─► Provider Registry: Gnani AI (Evon 30B Reasoning Model) as Primary Candidate   │
│    ├─► Model Catalog: evon-v3.3-30b & evon-v3.3-30b-instruct                           │
│    └─► LangGraph DAG: Deterministic Invariant Checkers (Sum ΔBudgets = 0)              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Official 60-Second Video Demo Script

The demo shows a Hindi note for a ₹50 tea expense. FinWise shows the transcription, the extracted amount, and the projected balance in the Food & Dining budget before the user saves. After saving, the user plays the spoken confirmation and opens the ledger entry. [Recording guide](DEMO_AND_POST.md#record-a-60-second-demo)

## 7. LinkedIn Post Copy (Ready to Publish)

Publish the draft after recording the live Prisma and Timbre flow. [LinkedIn draft](DEMO_AND_POST.md#linkedin-draft)

## 8. X (Twitter) Post & Thread Copy

Publish the draft with the verified video and the hashtags #GnaniAI and #GreatIndianAIInternshipChallenge. [X draft](DEMO_AND_POST.md#x-draft)

## 9. Verification & Test Evidence

- In the built-in browser, a draft of ₹900 against a ₹835 dining allocation projected ₹65 over budget. A ₹50 draft projected ₹785 remaining. After saving ₹50, a second ₹50 draft projected ₹735 remaining.
- The Financial Educator answered a budgeting question through Groq. The workflow trace identified the provider and model. Direct synthetic prompts also succeeded through Fireworks and OpenRouter.
- The live check synthesized a Hindi ₹50 tea expense with Timbre and transcribed it with Prisma. In the built-in browser, the uploaded recording showed ₹785 left in the dining budget, saved one ₹50 ledger entry, and played the Timbre confirmation. Reproduce the live round trip with `npm run verify:gnani` and a configured Voice API key.
- Run `npm run check` for TypeScript and `npm run verify:submission` for the local submission audit.

---

## 10. Quickstart Guide (Running Locally)

### Prerequisites
- Node.js `>=24.14.1 <25`
- Python `3.11+`
- MongoDB `7.0+`

### 1. Configure Environment Variables
Set the speech key and optional Evon deployment in `server/.env`:
```bash
GNANI_API_KEY=your_gnani_api_key_id_from_app_gnani_ai
GNANI_STT_URL=https://api.vachana.ai/stt/v3
GNANI_TTS_URL=https://api.vachana.ai/api/v1/tts/inference
# Optional Evon deployment
# GNANI_REASONING_URL=https://your-evon-host.example/v1
# GNANI_REASONING_API_KEY=your_evon_endpoint_key
# GNANI_MODEL=gnani/gnani-evon-v3.3-30B-A3B
```

Set `GNANI_REASONING_URL`, `GNANI_REASONING_API_KEY`, and optionally `GNANI_MODEL` in `server/.env`. AI Core also reads these settings from `server/AI_Core/.env`. Set `LLM_PROVIDER=gnani` for Finance Chat to prefer Evon and clear any existing `LLM_MODEL` override to use `GNANI_MODEL`. Restart both services after editing the files. The Prisma and Timbre credential remains `GNANI_API_KEY`. [Evon model card](https://huggingface.co/gnani/gnani-evon-v3.3-30B-A3B) · [Hosted API waitlist](https://www.gnani.ai/evon-waitlist)

[Prisma API documentation](https://docs.gnani.ai/api/STT/speech-to-text) · [Timbre API documentation](https://docs.gnani.ai/api/TTS/tts-inference) · [Evon model and deployment](https://huggingface.co/gnani/gnani-evon-v3.3-30B-A3B)

### 2. Start the Backend API Gateway
```bash
cd server
npm install
npm run dev
# Running on http://localhost:3000
```

### 3. Start the AI Core Service
```bash
cd server/AI_Core
python -m uvicorn api_service:app --host 0.0.0.0 --port 8001
# Running on http://localhost:8001
```

### 4. Start the React Frontend
```bash
cd client
npm install
npm run dev
# Running on http://localhost:5173
```

Open `http://localhost:5173/voice` to test the Bharat Voice Assistant. The app shows the configured speech mode in the stack status card. Complete the [final submission checklist](SUBMISSION.md#final-submission-checklist) before sending the project.

---

*Submitted by J Ganesh Kumar Reddy for The Great Indian AI Internship Challenge 2026.*
