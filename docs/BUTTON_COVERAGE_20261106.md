# Button and workflow coverage - 6 November 2026

Scope: synthetic QA account and dedicated local database, using Computer Use in the inbuilt browser. The built preview moved from port 5180 to **5181** after an unrelated project took 5180. That process was left untouched. This matrix distinguishes submitted local operations from inspected dialogs and staging prerequisites; it is not a claim that every action in every account has passed.

| Area | Controls and outcome | Coverage |
| --- | --- | --- |
| Ledger | Create USD 12.34 expense; category filter; EUR display; Edit preserves USD 12.34; unchanged save | Submitted and persisted |
| Splits | Open, add/remove category, enter two 6.17 allocations, save and expand breakdown | Submitted and persisted; failed Save/Clear covered by regressions |
| Recurring | Create monthly rule with original 12.34 min/max while EUR is selected | Submitted; API confirms original bounds |
| Review | Approve QA record, reload, reopen queue; approved record absent while 15 other pending records remain | Submitted and reloaded; single/bulk/material-change/foreign-user API regressions |
| Merchant suggestions | Native disclosure keeps long suggestions below the fold until requested | Rendered; existing normalization regression retained |
| Tasks | Create manual task, open detail, mark complete, search Completed | Submitted; detail shows Completed and disables completion |
| Task effects | Open Apply outcomes and cancel; named fields and cent precision | Dialog inspected; no financial effects applied in browser; draft/retry regression passes |
| Task calendar | Single sync creates reminder with due date 2026-12-05; calendar next-month/day selection reveals it | Submitted and persisted; single/batch strict-payload regression |
| Calendar estimate | Empty opening balance hides estimates and disables task; November 1000.50 becomes 988.16; switching month clears assumption; December remains 1000.50 despite “5 November” in reminder title; EUR display 920.46 | Actual final build at measured 390 CSS pixels; no horizontal overflow |
| Calendar calculations | Zero/negative opening balance, cents, investment outflow and unpriced/foreign-currency reminders | Automated regressions |
| Calendar export | Task ICS downloaded with matching UID and due date | Downloaded and parsed |
| Export center | All Time + standard columns CSV; current-month PDF generate and download | Successful local jobs/downloads; persisted PDF retrieved again and rendered on 6 November |
| Scheduled reports | Email/HTTPS webhook destinations and schedule dialog | Opened and cancelled; no external delivery |
| Manual workflow | Run Now, preview, confirmation, execute local QA task action | Database run status succeeded and task created |
| Worker | Queued CSV, signed cents, foreign workspace excluded; invalid PDF job fails; later CSV succeeds | Separate development worker/database; production drain remains open |
| AI document chat | Create Mobile release review 6 November from saved goals/tasks; Download PDF; Ask about this PDF; send follow-up | Real PDF and exact laptop quotation; zero model calls |
| Sources | Expand Sources; open exact owned physical page 1; return link preserved | Real file and extracted page inspected; earlier reload/return checks retained |
| Phone chat | Composer, quoted answer and source control at 390px; composer and history drawer open/close at 320px | Rendered; saved 390px screenshot |
| Copy response | Browser showed acknowledgement but automation clipboard read returned empty | Clipboard transport not certified; new regressions require awaited success and visible rejection handling |
| Starter questions | Enter activates the native saved-activity question; exact singular wording now returns one owned open task; Open tasks leads to that saved record | Final client entry LFS3h7um verified; one activity_review step, 5ms, zero model calls |
| Other pages | Existing 25-route phone inventory, auth recovery and account/workspace isolation | Prior dated evidence in BROWSER_TEST_RESULTS.md; not all mutations submitted |
| Destructive/access/payment actions | Permanent deletion, key creation, sharing permissions, paid checkout and real transfers | Not submitted; general button-testing instructions do not authorize these actions |

Evidence: `output/browser/button-api-results-20261105.json`, `workflow-result-20261106.json`, `mobile-document-chat-20261106.jpg`, `document-chat-20261106.jpg`, and `output/deployment/worker-smoke-20261105.json`. Local QA fixture names retain 5 November where they were created that day.

Release checks still requiring staging: Docker/Compose, production startup and SIGTERM drain, TLS/cookies/domain configuration, backup/restore, SMTP/OAuth/Stripe/provider entitlement, bank callbacks, cloud delivery, PWA upgrades from older cached shells, broader accessibility and load tests. The current local cache was bypassed only to verify a known build and normal settings were restored.
