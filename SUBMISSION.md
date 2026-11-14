# FinWise Bharat Voice

**Participant** J Ganesh Kumar Reddy  
**Challenge** The Great Indian AI Internship Challenge 2026  
**Deadline** November 15, 2026 at 6:00 p.m. IST. [Official rules](https://www.gnani.ai/internship) · [Submission form](https://forms.cloud.microsoft/r/dfFShbp7W7)

## What the project solves

Logging small purchases takes time when a finance app requires a typed description, category, amount, and payment method. FinWise lets a user record or upload an expense note, review the transcript and extracted fields, and save it to the same ledger they use for budgets and transactions.

The review shows how the expense would change the category's monthly budget. For a dining allocation equivalent to ₹835 with no prior spending, a ₹50 note shows ₹785 remaining. If the draft would cross the limit, the preview shows the projected overage. The user can correct the note, review it again, save it, or discard it. Retrying a save for the same draft returns the original ledger entry.

## Gnani integration

| Service | Role | Verification |
| --- | --- | --- |
| Prisma v3.0 | Transcribes recordings for the voice expense workflow. | Transcribed the Hindi ₹50 tea sample in the built-in browser. |
| Timbre | Speaks the ledger confirmation in the chosen language. | Generated the Hindi sample and played the save confirmation and finance chat responses in the built-in browser. |
| Evon v3.3 30B | Optional reasoning provider for Finance Chat and Bharat Voice. | The provider contract was tested with a mocked endpoint. The local workspace requires a separate Evon endpoint for live inference. |

The workspace also includes transaction tracking, budgets, goals, recurring payments, and a finance chat. The finance chat's workflow trace shows which provider answered. Groq answered a budgeting question through the Financial Educator in the built-in browser.

Open **Live voice chat** in Finance Chat or from Bharat Voice. Review and send each transcript, or enable **Hands-free conversation** to submit completed turns and reopen the microphone after Timbre plays the start of the reply. A follow-up can reuse assumptions from the earlier question. The demo shows a three-year compound-interest follow-up that returns ₹1,331.

## Run the project

Start MongoDB, copy the environment examples, and set the required values in each service. In three terminals, run the API in `server` with `npm install` and `npm run dev`, the AI service in `server/AI_Core` with `python -m uvicorn api_service:app --port 8001`, and the web app in `client` with `npm install` and `npm run dev`. [Integration setup](GNANI_AI_SUBMISSION.md#1-configure-environment-variables)

Open `http://localhost:5173/voice` for the expense workflow and `http://localhost:5173/submission` for the demo materials.

## Final submission checklist

- [x] Verify live Prisma and Timbre with `npm run verify:gnani` and compare the transcript with the synthetic sample.
- [x] Prepare the narrated walkthrough and [three-minute script](DEMO_SCRIPT_3MIN.md).
- [ ] Post the demo on LinkedIn or X. Tag Gnani AI and include `#GnaniAI` and `#GreatIndianAIInternshipChallenge`.
- [ ] Enter the video, one nominated post URL per platform, the written explanation, the models shown, and the participant contribution in the official form. [Submission form](https://forms.cloud.microsoft/r/dfFShbp7W7)

[60-second recording plan, social drafts, and form copy](DEMO_AND_POST.md)
