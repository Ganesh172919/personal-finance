# E2E Test Infrastructure Specification: FinWise Bharat Voice
**Challenge**: The Great Indian AI Internship Challenge 2026 by Gnani.ai  
**Participant**: J Ganesh Kumar Reddy  
**System**: FinWise Bharat Voice — Indic Voice Autonomous Financial Platform  
**Document Version**: 1.0.0  
**Status**: APPROVED & PUBLISHED  

---

## 1. Executive Summary & Purpose

The FinWise Bharat Voice End-to-End (E2E) Test Infrastructure provides opaque-box, requirement-driven verification for the complete Indic voice financial platform. It guarantees that sovereign AI models—**Gnani Prisma v3.0** (Speech-to-Text), **Gnani Timbre** (Text-to-Speech), and **Gnani Evon v3.3 30B** (Financial Reasoning LLM)—operate seamlessly together across 12 Indic dialects, code-mixed Hinglish, noisy telephonic channels, and high-stakes financial ledger transactions.

The test infrastructure is architected for:
1. **Deterministic Offline Execution**: 100% pass rate in CI/CD without requiring external cloud connectivity or paid API credits.
2. **Zero Port Collisions**: In-process HTTP testing via `supertest` against Express 5 `createApp()` without network socket binding.
3. **Decoupled Database Isolation**: In-memory MongoDB lifecycle via `MongoMemoryServer` eliminating 10-second query buffering timeouts.
4. **Pure Node.js Audio Synthesis**: Mathematical byte-level PCM WAV generation providing clean 16kHz audio, 8kHz telephonic audio, audible ~25KB chime tones, and pathological corrupted buffers on demand.

---

## 2. Test Design Methodology

The test suite applies four complementary testing methodologies to achieve comprehensive, defect-resistant test coverage:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FinWise Bharat Voice — Test Design Matrix                      │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ Methodology             │ Focus Area & Verification Strategy                           │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 1. Category-Partition   │ Systematic partitioning of input domains (12 Indic dialects, │
│    Testing              │ 4 STT operating modes, TTS gender/rate/pitch/emotions,       │
│                         │ expense categories, payment channels, debt directions).     │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 2. Boundary Value       │ Stress-testing parameter edges: 0-byte audio, 10MB limits,   │
│    Analysis (BVA)       │ 4000-char limits, 0.5x-2.0x rates, -10 to +10 pitch, zero,   │
│                         │ negative refunds, colloquial fractions ("dedh hazaar"),     │
│                         │ truncated RIFF headers, corrupted magic bytes.               │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 3. Pairwise             │ Orthogonal combination of multi-dimensional factors:         │
│    Combinatorial        │ (Dialect x Audio Quality x Noise Level x Emotion x Channel)  │
│    Testing              │ ensuring all pairwise interactions are exercised.            │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 4. Real-World Workload  │ 5 end-to-end socio-economic operational personas simulating   │
│    Testing              │ Kirana store closing, street commuter auto splits, rural     │
│                         │ Mandi harvest sales, micro-merchant hand loans, and festival │
│                         │ shopping.                                                    │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 3. 4-Tier Test Architecture

The test suite is structured into four progressive tiers residing under `server/src/test/e2e/`:

```text
server/src/test/e2e/
├── fixtures/
│   └── audioFixtures.ts              # Mathematical Node.js Buffer WAV synthesis
├── helpers/
│   └── authHelper.ts                 # Fast JWT cookie, CSRF & org context generator
├── tier1_feature_coverage.test.ts    # Tier 1: Isolated Happy-Path Feature Coverage
├── tier2_boundary_corner.test.ts     # Tier 2: Boundary, Pathological & Security Inputs
├── tier3_cross_feature.test.ts       # Tier 3: Multi-Model End-to-End Pipelines
└── tier4_real_world.test.ts          # Tier 4: Socio-Economic Persona Scenarios
```

### Tier Matrix Overview

| Tier | Test Suite File | Minimum Scope | Primary Verification Target |
|---|---|---|---|
| **Tier 1** | `tier1_feature_coverage.test.ts` | >= 5 tests per feature | 12 Indic dialects, 4 STT modes, Timbre TTS options (genders, rates, audio tags `<emphasis>`, `<pauses>`, emotions), Evon reasoning expense extraction, BFSI Khata debt tracking, conversational voice Q&A, and platform telemetry. |
| **Tier 2** | `tier2_boundary_corner.test.ts` | >= 5 tests per boundary | Pathological inputs: empty audio buffers (>=5), corrupted audio bytes (>=5), 8kHz narrowband telephonic audio (>=5), bazaar noise & SNR (>=5), zero/negative/fractional amounts (>=5), missing/invalid credentials (>=5), payload size & bounds limits (>=5). |
| **Tier 3** | `tier3_cross_feature.test.ts` | 5 complete pipelines | Multi-model integration: Speech-to-ledger commitment, telephonic audio + noise suppression + Hinglish extraction + expressive TTS confirmation, Khata debt tracking -> reminder synthesis -> settlement, conversational financial health check, and simulation profile switching. |
| **Tier 4** | `tier4_real_world.test.ts` | 5 real-world personas | Realistic application scenarios: Kirana store daily cash & UPI sales, street commuter auto fare split, rural Mandi harvest sales, micro-merchant informal hand loans, and festival shopping. |

---

## 4. Feature Inventory & Coverage Mapping

Every feature from `PROJECT.md § Feature Inventory` is mapped to its automated verification tier:

| Feature ID | Feature Name | Description | Verification Tier | Verification File |
|---|---|---|---|---|
| **F1** | Gnani Provider Strategy Pattern | `IGnaniVoiceProvider` abstraction decoupling `LiveGnaniVoiceProvider` from `MockGnaniVoiceProvider` | Tier 1, Tier 3 | `tier1_feature_coverage.test.ts`<br>`tier3_cross_feature.test.ts` |
| **F2** | Synthetic Audible PCM Chime Generator | Generate valid 16kHz PCM WAV chime (~25KB) for mock TTS confirmations | Tier 1, Tier 3 | `tier1_feature_coverage.test.ts`<br>`tier3_cross_feature.test.ts` |
| **F3** | In-Memory Voice Test Context Decoupling | Decouple Mongoose ledger queries during tests/mock runs (<300ms execution) | Tier 1, Tier 3 | `tier1_feature_coverage.test.ts`<br>`tier3_cross_feature.test.ts` |
| **F4** | Multi-Profile Simulation Engine | Support `instant` (0ms), `realistic_latency` (550ms), and `chaos_error` modes | Tier 3 | `tier3_cross_feature.test.ts` |
| **F5** | "Bolo Aur Kharcha Jodo" Hinglish Voice Expense Logging | Zero-touch voice expense logging in mixed Hinglish with sub-category and merchant | Tier 1, Tier 3, Tier 4 | `tier1_feature_coverage.test.ts`<br>`tier3_cross_feature.test.ts`<br>`tier4_real_world.test.ts` |
| **F6** | Rural & Vernacular Livelihood Presets | Vernacular presets for rural economy (Mandi sales, tractor diesel, fertilizers, Kirana) | Tier 1, Tier 4 | `tier1_feature_coverage.test.ts`<br>`tier4_real_world.test.ts` |
| **F7** | Expressive Voice Confirmations via Timbre Audio Tags | Rich TTS audio tags (`<emphasis>`, `<pauses>`, emotional prosody: celebratory, cautionary) | Tier 1, Tier 3 | `tier1_feature_coverage.test.ts`<br>`tier3_cross_feature.test.ts` |
| **F8** | BFSI Khata Localized Debt Reminders | Voice debt tracking with synthesized spoken WhatsApp reminders in Indic languages | Tier 1, Tier 3, Tier 4 | `tier1_feature_coverage.test.ts`<br>`tier3_cross_feature.test.ts`<br>`tier4_real_world.test.ts` |
| **F9** | Live Gnani API Credentials Drawer | Dynamic entry of `GNANI_API_KEY` with visual live vs. mock indicators | Tier 1, Tier 2 | `tier1_feature_coverage.test.ts`<br>`tier2_boundary_corner.test.ts` |
| **F10** | Standalone Live API Verification CLI | `scripts/verify-gnani-live.mjs` 5-stage live handshake | Runner / Scripts | Verified by CLI runner |
| **F11** | Enhanced Verification Scripts & NPM Hooks | `"test:voice"`, `"test:e2e:gnani"` scripts in package.json | Runner / Infra | All test runner scripts |
| **F12** | Comprehensive Written Project Explanation | Contest submission compendium | Docs / M4 | `GNANI_AI_SUBMISSION.md` |
| **F13** | Dual Demo Video Walkthrough Scripts | 60s pitch + 3-5m walkthrough scripts | Docs / M4 | `docs/video_demo_script.md` |
| **F14** | Public Video Recording Guide | Recording setup and teleprompter guide | Docs / M4 | `docs/video_demo_script.md` |
| **F15** | Social Media Launch Copy | Ready-to-publish LinkedIn and X posts | Docs / M4 | `docs/social_media_posts.md` |
| **F16** | Contest Checklist & Category Alignment Guide | Compliance verification across all 10 award categories | Docs / M4 | `GNANI_AI_SUBMISSION.md` |
| **F17** | Opaque-Box E2E Test Suite (Tiers 1-4) | Comprehensive requirement-driven test suite | Full Suite | `server/src/test/e2e/*.test.ts` |
| **F18** | Adversarial Coverage Hardening (Tier 5) | White-box stress testing and chaos injection | Hardening / M5 | Verified by Challengers & Auditor |

---

## 5. Offline Audio Fixture Protocol

All audio fixtures are generated dynamically in-memory without external files or codecs.

### 5.1 44-Byte RIFF/WAVE Header Specification

```text
Offset  Field           Type        Value / Description
00..03  ChunkID         ASCII       "RIFF"
04..07  ChunkSize       uint32_le   36 + dataSize
08..11  Format          ASCII       "WAVE"
12..15  Subchunk1ID     ASCII       "fmt "
16..19  Subchunk1Size   uint32_le   16 (for PCM)
20..21  AudioFormat     uint16_le   1 (Linear PCM)
22..23  NumChannels     uint16_le   1 (Mono)
24..27  SampleRate      uint32_le   16000 or 8000 Hz
28..31  ByteRate        uint32_le   SampleRate * NumChannels * BitsPerSample / 8
32..33  BlockAlign      uint16_le   NumChannels * BitsPerSample / 8 (= 2)
34..35  BitsPerSample   uint16_le   16 bits
36..39  Subchunk2ID     ASCII       "data"
40..43  Subchunk2Size   uint32_le   Data payload size in bytes
```

### 5.2 Fixture Types Generated by `audioFixtures.ts`

1. **Clean 16kHz PCM WAV** (`createClean16kHzWav`): 16,000 Hz, 16-bit Mono linear PCM.
2. **Narrowband 8kHz Telephonic WAV** (`createTelephonic8kHzWav`): 8,000 Hz, 16-bit Mono simulating mobile 2G/PSTN carrier channels.
3. **Synthetic Audible Chime WAV** (`createAudibleChimeWav`): 16,000 Hz, 0.8s duration, 440Hz sine wave tone (~25,644 bytes ~ 25KB).
4. **Bazaar Background Noise WAV** (`createBazaarNoiseWav`): Multi-harmonic simulated market chatter with 3dB SNR.
5. **Pathological Corrupt Fixtures**:
   - `emptyBuffer`: 0-byte Buffer.
   - `truncatedHeader`: 12-byte `RIFF....WAVE` without `fmt ` chunk.
   - `garbagePayload`: ASCII string masquerading as audio.
   - `spoofedImage`: JPEG magic bytes (`0xFF 0xD8 0xFF 0xE0`).
   - `corruptFmtChunk`: WAV header with `Subchunk1Size = 0`.
   - `oddLengthBuffer`: WAV header with 17 bytes (odd byte boundary).
   - `oversizedBuffer`: 11MB buffer exceeding the 10MB Multer limit.

---

## 6. Authentication & Tenant Isolation Helper

Authenticated HTTP requests against `createApp()` require four parameters:
1. **JWT Cookie**: `Cookie: jwt=<token>` (Passport CachedJwtStrategy extracts strictly from `req.cookies.jwt`).
2. **Double-Submit CSRF Cookie**: `Cookie: csrf_token=<token>` (retrieved from `GET /api/auth/csrf`).
3. **Double-Submit CSRF Header**: Header `x-csrf-token: <token>` (must match `csrf_token` cookie).
4. **Organization Header**: Header `x-org-id: <orgId>` (enforced by `orgContext` middleware).

`authHelper.ts` encapsulates this into `createAuthedSession(app)`:
```typescript
const session = await createAuthedSession(app);
const response = await session.applyAuth(
  request(app).post("/api/v1/voice/transcribe")
    .attach("audio", audioBuffer, "speech.wav")
);
```

---

## 7. Execution Commands & Thresholds

### Running the E2E Test Suite

```bash
# Run all E2E Voice Tests (Tiers 1 - 4)
npm run test:ci --prefix server -- src/test/e2e/

# Run Tier 1 Feature Coverage
npm run test:ci --prefix server -- src/test/e2e/tier1_feature_coverage.test.ts

# Run Tier 2 Boundary & Corner Cases
npm run test:ci --prefix server -- src/test/e2e/tier2_boundary_corner.test.ts

# Run Tier 3 Cross-Feature Pipelines
npm run test:ci --prefix server -- src/test/e2e/tier3_cross_feature.test.ts

# Run Tier 4 Real-World Scenarios
npm run test:ci --prefix server -- src/test/e2e/tier4_real_world.test.ts

# Run Existing Voice Service Unit Tests
npm run test:voice

# Run Complete Contest Submission Verification (All 19 checks)
npm run verify:submission
```

### Quality & Performance Acceptance Thresholds

| Metric | Target / Threshold |
|---|---|
| **Test Pass Rate** | 100% (Zero test failures allowed) |
| **Exit Code** | `0` across all test runs |
| **Flakiness** | 0% (Deterministic execution over 5 consecutive runs) |
| **Tier 1 Duration** | < 10,000ms |
| **Tier 2 Duration** | < 8,000ms |
| **Tier 3 Duration** | < 10,000ms |
| **Tier 4 Duration** | < 8,000ms |
| **Audio Upload Limit** | 10 Megabytes (`10 * 1024 * 1024`) |
| **Synthesis Text Limit** | 1 to 4000 characters |
| **Speaking Rate Limits** | 0.5 to 2.0 |
| **Pitch Limits** | -10 to +10 |
| **Confidence Minimum** | >= 0.90 for standard Indic speech |
