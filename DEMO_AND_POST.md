# FinWise Bharat Voice demo and submission copy

The 60-second MP4 walkthrough is included in the submission ZIP. It uses screenshots from the tested application, the live Hindi audio used for transcription, and Timbre narration. The confirmation in the video is a synthesized re-creation. The browser test separately verified the app’s live confirmation playback. [Test evidence](SUBMISSION_QA.md)

The ZIP also includes a three-minute walkthrough and a timed Markdown script. The longer version covers the ledger, Telugu voice Q&A, finance education, and PDF creation. [Three-minute script](DEMO_SCRIPT_3MIN.md)

## Verify the live speech path

Set `GNANI_API_KEY` in `server/.env`, then run `npm run verify:gnani` from the repository root. The check sends one synthetic Hindi sentence to Timbre, passes the returned WAV to Prisma, and prints the transcript. Compare it with the sample sentence and play `dist/submission/demo/live-gnani-check.wav`. The command saves the audio after both providers respond live and FinWise extracts the expected ₹50.

Restart the app server with the configured key and open **Bharat Voice AI** in a fresh demo workspace. In **Finance → Budgets**, set an INR 835 monthly allocation for **Food & Dining**. Switch the Transactions display currency to **INR**. Check that the review shows ₹50 and a projected ₹785 remaining, then play **Replay Voice** after saving. If the browser cannot access the microphone, use **Upload an expense recording** with a short recording of the sample. Keep the key, sign-in screen, and personal records outside the recording.

## Record a 60-second demo

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:08 | Bharat Voice AI with Hindi selected. | “FinWise Bharat Voice helps people log everyday expenses in the language they speak.” |
| 0:08–0:23 | Start the microphone. Say the sample and stop the recording. | “मैंने चाय पर पचास रुपये खर्च किए।” |
| 0:23–0:36 | Show the editable transcript, ₹50 amount and projected ₹785 remaining, then select **Save to ledger**. | “Gnani Prisma transcribes the note. I can check the amount and see what I’d have left in my dining budget before I save.” |
| 0:36–0:47 | Play the spoken confirmation. Leave room for the audio. | “Gnani Timbre reads the confirmation back.” |
| 0:47–1:00 | Open Transactions, choose INR, and show the new ₹50 entry. | “The entry is now in the same ledger as the rest of my spending. I built FinWise Bharat Voice for the Great Indian AI Internship Challenge.” |

Use [the timed text script](DEMO_PRESENTATION.txt) with a screen recorder that captures the FinWise window and its audio. Play the exported video before posting to confirm that the expense and ledger entry are visible and that both the sample utterance and Timbre’s reply are audible.

## LinkedIn draft

I built FinWise Bharat Voice so people can track everyday spending by speaking in an Indian language. In this demo, I log a ₹50 tea expense in Hindi. Gnani Prisma transcribes the note, FinWise shows how much I’d have left in my dining budget, and Gnani Timbre reads the confirmation back after I save.

I built the frontend, backend, speech integration, and tests as a solo entrant for the Great Indian AI Internship Challenge.

#GnaniAI #GreatIndianAIInternshipChallenge

Attach the verified video and tag Gnani AI using LinkedIn’s account picker.

## X draft

I built FinWise Bharat Voice to log everyday spending by voice. This demo shows a ₹50 expense in Hindi, transcribed by Gnani Prisma and confirmed aloud by Gnani Timbre.

#GnaniAI #GreatIndianAIInternshipChallenge

Attach the verified video and tag Gnani AI’s official account in the composer.

## Submission form copy

- **Project** — FinWise Bharat Voice
- **Problem and users** — Logging day-to-day expenses can take several screens and require typed descriptions. FinWise lets people who prefer to speak in Indian languages enter expenses by voice and review them in their ledger.
- **How it works** — The user records or uploads an expense note. Gnani Prisma transcribes it, and FinWise previews the extracted amount, category, and effect on the monthly budget. The user can edit the transcript and review it again before saving. Repeating a save request for the same draft returns the existing entry. Gnani Timbre reads the confirmation aloud, and Transactions shows the saved entry in the selected reporting currency.
- **Gnani technology shown** — Prisma speech-to-text and Timbre text-to-speech.
- **Contribution** — J Ganesh Kumar Reddy, solo developer. I built the frontend, backend, speech integration, and automated tests.
- **Links to add** — The verified demo video and one public post URL per platform used.

The public post must be live before you enter its URL in the form. The deadline is **November 15, 2026 at 6:00 p.m. IST**. [Gnani program requirements](https://www.gnani.ai/internship) · [Official submission form](https://forms.cloud.microsoft/r/dfFShbp7W7)
