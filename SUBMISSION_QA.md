# FinWise submission verification

## Submission rehearsal

| Browser check | Result |
| --- | --- |
| Finance Chat, fresh debt example | The initial route produced a generic plan. After the routing fix, the Financial Educator used one Groq call and explained paying both minimums before directing extra money to the 19% credit card. |
| Finance Chat, follow-up | After the card is paid off, the model said to redirect the extra payment to the lower-rate loan. The one-sentence answer used the same example and one model call. |
| Bharat Voice, custom questions | “How much of my budget is left this month?” returned ₹735 from saved limits. “How much have I spent in total this month?” returned ₹100 and Food & Dining from the ledger. Replay entered the Timbre playback state. |
| Dictation | The imported clip placed the ₹1,000 compound-interest question in the editable composer. The submitted draft returned ₹1,210 including ₹210 interest, with zero model calls. |

The rehearsal used the isolated synthetic workspace. The submission presentation is in [DEMO_PRESENTATION.txt](DEMO_PRESENTATION.txt). The production client build, 61 focused server tests, and 18 AI Core routing and provider tests passed.

## Final browser retest

| Check | Observed result |
| --- | --- |
| Product navigation | The Bharat Voice page has a direct link to Live voice chat. The challenge banner, credit badge, and dossier controls are gone from the voice tools. The submission materials remain at `/submission`. |
| Finance Chat via AI Core | Groq used one model call for each education turn. It distinguished unexpected emergencies from planned purchases and retained both topics in the follow-up. It added a definition beyond the requested two bullets. A separate credit-card question received one sentence explaining that unpaid balances keep accruing interest. |
| Bharat Voice Q&A | A Telugu question identified ₹100 spent and Food & Dining. A budget question returned ₹735 across saved budget categories and identified Food & Dining as the top spending category. The budget answer uses the saved limits and avoids a model call. |
| Dictation | In the black theme, a live Prisma transcript from the imported clip appeared as the editable draft “What about after three years” without sending. In the white theme, the ₹1,000 sample transcribed correctly. |
| Hands-free conversation | In the built-in browser the imported ₹1,000 question sent automatically after the user enabled Hands-free conversation. The calculator returned ₹1,210 with ₹210 total interest. Timbre playback reached the playing state. A component test verifies that microphone capture reopens after a reply and that cancel aborts it. The built-in browser did not grant microphone access. |
| Evon 30B | Bharat Voice displays the model and its endpoint status. The AI Core provider contract passed with a mocked endpoint using the separate reasoning credential. No live Evon endpoint was available. [Model card](https://huggingface.co/gnani/gnani-evon-v3.3-30B-A3B) · [Hosted API waitlist](https://www.gnani.ai/evon-waitlist) |

Live voice alternates between listening and speaking. If the streaming connection stalls, an imported clip retries through Prisma's HTTP endpoint. Replaying a reply reuses the audio in the browser. The final Bharat Voice budget request completed in 12.0 seconds locally and included Timbre synthesis. It avoided the separate background coaching request.

The production build and 33 submission checks passed. The client suite passed 530 tests across 66 files before a worker startup timeout skipped the Tasks file. That file passed all 22 tests on an isolated retry. The two focused server runs passed 107 tests, and AI Core passed all eight provider configuration tests.

## Black and white theme retest

The built-in browser confirmed pure black and pure white page backgrounds and checked the 28 main navigation routes across both modes. Public Bharat Voice and Submission Hub pages now have a workspace link and their own theme controls. The updated video opens with both themes.

| Check | Observed result |
| --- | --- |
| Dictation in white mode | Gnani Prisma returned the editable ₹1,000 compound-interest prompt from an imported clip. Microphone access was unavailable in the built-in browser. |
| Live voice in black mode | The Prisma WebSocket returned “And last month.” The edited question retrieved the October ledger result, and Skip audio dismissed speech preparation. |
| AI quota | The browser showed Limit 60, Used 60, Remaining 0. The local ledger still answered with zero model calls. The account was a synthetic local workspace. |
| Calculation follow-up | The calculator returned ₹1,210 including ₹210 interest after two years at 10%. After the rate changed to 5%, it returned ₹1,102.50 with zero model calls. |
| Live concept comparison | A generic emergency-versus-sinking-fund prompt initially triggered a personal plan. The updated router sent it to the Financial Educator, and Groq returned the requested two bullets using one call. The next answer gave an example for each fund plus an extra definition. |

## Composer dictation, calculation, and site navigation

The built-in browser opened the 28 site navigation routes. Finance and Investment Portfolio needed a second check after the first load was slow. The browser also exercised the expense filter, transaction review queue, saved PDF search and preview, document Q&A, and the submission hub.

| Check | Observed result |
| --- | --- |
| Composer dictation | A live Prisma transcription of the imported English clip appended the complete question to “Answer briefly.” The composer kept it editable and sent it only after the user selected Send. |
| Microphone cancellation | The permission state was visible, and Cancel dictation immediately restored the existing draft. This browser left microphone permission pending, so the live recognition check used audio import. |
| Compound-interest accuracy | The first Groq answer ended at ₹1,210 but incorrectly called ₹110 the total interest. The calculator now returns ₹1,210 with ₹210 total interest. |
| Rate and duration follow-ups | With the same ₹1,000 principal, changing the rate to 5% returned ₹1,102.50 after two years. “And after three years?” retained 5% and returned ₹1,157.63. All three calculator turns used zero model calls. |
| Live explanation | Groq correctly distinguished funds for unexpected costs from those for planned expenses. When “that fund” could refer to either, it assumed emergency fund and gave two examples. |
| Document Q&A | Both checklist items now appear in the quote from page one. A request for a bank routing number absent from the PDF returned insufficient evidence. |

## Live voice conversation

Tested in the built-in browser on the local synthetic workspace.

| Check | Observed result |
| --- | --- |
| Hindi clip via Prisma WebSocket | Transcript was “मैंने चाय पर 50 रुपये खर्च किए।” |
| English voice turn | The transcript preserved ₹1,000, 10% per year, and 2 years. The Financial Educator returned ₹1,210. |
| Follow-up in the same chat | “What about after 3 years” reused the earlier assumptions and returned ₹1,331 and ₹331 total interest. The trace showed one Groq call. |
| Generic debt comparison | The Financial Educator explained that snowball pays the smallest balance first and avalanche pays the highest interest rate first. The final answer proposed no account action. |
| Education follow-up and failover | “Give me a generic example of when someone would use that fund” stayed with the Financial Educator. Fireworks supplied a relevant example after failures at two providers, taking about 19 seconds in that run. The later Groq run used one call and gave an example plus a definition despite a one-sentence request. |
| Hypothetical variable-rate risks | The updated route stayed with the Financial Educator and identified rising payments and budgeting uncertainty. Groq added example bullets beyond the requested two, and its mortgage illustration gave no explicit loan term. |
| Timbre playback | Automatic playback reached the live Timbre playing state on the final follow-up. The browser offered stop and replay. An earlier long reply timed out, which led to shortening automatic speech to the opening sentence. |
| Monthly spending | The two synthetic entries totaled $1.20 in the workspace reporting currency. Food & Dining was the top category. The trace showed zero model calls. |
| Short ledger follow-up | Typed “And last month?” and Prisma's “And last month” transcript both returned no recorded October expenses from the same chat. The voice turn showed an 88 ms ledger trace with zero model calls. |
| Skip audio | After the ledger answer, clicking Skip audio stopped the pending speech request and returned the capture controls. The written answer stayed in the conversation. |
| Microphone | Start and cancel worked in the built-in browser. After 12 seconds without permission, a message explained how to allow access or import a clip. Verified recognition used imported audio through the same relay. |

The WebSocket relays 32 ms PCM frames through the authenticated API. The key stays on the server. A voice turn uses one transcription stream, one chat request, and one speech request after the user reviews and sends the transcript. Replay uses audio already downloaded by the browser. [Gnani Prisma WebSocket reference](https://docs.gnani.ai/api/STT/stt-websocket)

The flow is turn-based. The user can pause, finish, or cancel capture, then review the transcript before sending. The complete assistant answer stays in the chat.

## Expense and chat verification

The built-in browser tests used a local FinWise workspace with synthetic records. The live Gnani configuration used Prisma v3.0 for transcription and Timbre for speech. The Financial Educator used Groq for the live chat questions.

| Flow | Observed result |
| --- | --- |
| Hindi expense upload | Prisma transcribed the ₹50 tea sample. The review identified Food & Dining and showed ₹735 remaining after the second hypothetical ₹50 purchase. |
| Save and reporting currency | The save played a live Timbre confirmation. The Transactions view displayed two separate ₹50 test entries in INR, for ₹100 total. |
| Telugu voice Q&A | The answer reported ₹100 spent and identified Food & Dining. The browser replay entered the live playback state. |
| Current-month spending chat | With one ₹50 entry and USD reporting, chat returned $0.60 and Food & Dining. The trace showed zero model calls. An API test checked that prior-month and separate-workspace transactions were excluded. |
| Compound-interest chat | Groq calculated ₹1,210 from a hypothetical ₹1,000 at 10% compounded annually for two years. |
| Debt education chat | The debt avalanche answer prioritized the highest interest rate first. |
| Emergency fund chat | The answer explained how a cash reserve covers unexpected expenses and helps avoid borrowing. |
| PDF creation | Chat created FinWise QA Checklist, showed its download link, and saved it in Files with zero model calls. |
| Navigation and submission tools | Previous browser runs opened 28 routes and verified the dossier download and teleprompter controls. |

For the monthly spending question, browser time from send to reply was 1.495 s before the change and 0.919 s after it. These were individual local observations. The updated Express request completed in 177 ms and skipped retrieval and AI Core. The live education requests took 1.498 to 2.776 s at the API. In the same run, transcription took 688 ms, expense preview took 32 ms, and save with speech synthesis took 4.657 s. Voice Q&A now uses one MongoDB aggregation for the ledger values, replacing four sequential reads.

The latest focused suites passed 20 chat API tests and 53 voice, cross-feature, and budget tests. The production build, earlier live speech verification, and submission archive checks are recorded in the workspace.

The supplied MP4 is a narrated walkthrough assembled from actual browser captures. The browser’s screen recorder did not start a continuous capture. Public posting and form submission remain pending. Live financial institution integrations, production traffic, and the optional Evon deployment were outside this verification.

## November 14 browser retest

| User request or interaction | Result |
| --- | --- |
| “How much have I spent in total this month?” | Fixed a route that gave a generic plan. The updated answer showed $1.20 and Food & Dining for the two ₹50 test purchases, with zero model calls. |
| “What was my total spending last month?” | The updated route reported no recorded October 2026 expenses, with zero model calls. The API test separately seeded a prior-month expense to verify it appears only in that period. |
| “What can I do this week to work on my saved goals and tasks?” | Routed to the saved activity review and reported that no goals were supplied. It did not generate an unrelated set of investment or automation suggestions. |
| Debt snowball and debt avalanche in two bullets | The model initially added a definition and an example block. After the educator prompt update, Groq returned two bullets, one per strategy, with the correct ordering. |
| Emergency fund in one sentence, compound interest, and inflation in Hindi | Groq returned one sentence for the emergency-fund request, ₹1,210 for the worked example, and a Devanagari answer for the Hindi request. |
| Education answer context | General education no longer shows the irrelevant records-coverage block. The model trace remains visible. |
| Read aloud twice | Playback of the prior-month answer started and stopped twice. The second play reused the generated audio within the same chat message. |
| Files and mobile chat | The generated checklist persisted and was found by search. The chat document had no horizontal page overflow at a 390 px layout width, and the desktop history sidebar was hidden. |

The updated spending route goes directly to the authenticated ledger and skips AI Core. Replay reuses one successful Timbre audio response per mounted chat message. The provider still controls first-play synthesis time. The three-minute walkthrough uses real browser captures and Timbre narration. [Timed script](DEMO_SCRIPT_3MIN.md)
