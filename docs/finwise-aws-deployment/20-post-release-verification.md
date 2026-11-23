# Post-release verification guide

Use this guide after a reviewed application release or an infrastructure change.
Record the exact release SHA, hostname, verification time and operator.
Perform tests with a designated account and non-sensitive data.
Do not record passwords, session cookies, access tokens or personal financial information.

## Establish the release under test

1. Confirm the AWS account and region.
2. Confirm the EC2 instance identifier.
3. Confirm the checkout path is `/opt/finwise`.
4. Record `git rev-parse HEAD`.
5. Compare the result with the reviewed target SHA.
6. Confirm the relevant Compose project and file combination.
7. Inspect service status.
8. Record the previous SHA and rollback-image status.
9. Confirm whether database migrations were applied.
10. Record the backup recovery point used for release planning.

If the checkout and intended target differ, stop and investigate before declaring the release successful.
If the checkout matches but an old image remains running, investigate the image and container state.
Do not infer the running release only from the GitHub branch tip.

## External DNS

1. Query the hostname from outside the host network.
2. Confirm that the A record points to the intended Elastic IP.
3. Confirm that there is no unintended IPv6 record.
4. Record the resolver and time when investigating inconsistencies.
5. Repeat for each hostname intended to serve traffic.

The DigitalPlat alias had no public A record at the last recorded check.
Do not report it as live until DNS and HTTPS are verified.

## External HTTPS

1. Connect using the canonical HTTPS hostname.
2. Confirm that the client accepts the certificate.
3. Confirm that the certificate matches the requested hostname.
4. Check that HTTP redirects to the intended HTTPS address when applicable.
5. Load the login page.
6. Load the registration page.
7. Check the health route.
8. Check the Python gateway health route.
9. Repeat the relevant checks for any active alias.
10. Record the status and time for each route.

Use certificate verification for the final check.
Do not treat a request using disabled certificate verification as proof of a trusted public certificate.

## Anonymous access

1. Open a fresh browser session without an authenticated account.
2. Request an authenticated profile endpoint.
3. Confirm the application rejects unauthorized access as expected by the release.
4. Check that no private profile data is returned.
5. Record the status without recording cookies or tokens.

The release script checks an anonymous profile response as part of its smoke procedure.
That single check does not replace a full authorization review.

## Authentication

1. Open the login page in a fresh browser session.
2. Use the designated test account.
3. Sign in using the supported production flow.
4. Confirm the expected authenticated page loads.
5. Refresh the page and confirm session recovery.
6. Navigate between relevant application pages.
7. Sign out.
8. Confirm the signed-out session cannot access protected data.
9. Test registration or recovery email only when appropriate and authorized.
10. Record the outcome without credentials or codes.

If the hostname changed, check cookie scope, CORS, CSRF and callback configuration.
If email is involved, confirm delivery rather than relying only on SMTP authentication.

## Transaction workflow

1. Use the designated test account.
2. Choose a clearly identified disposable test entry.
3. Create the entry using an amount and description that contain no personal financial data.
4. Confirm the entry appears in the expected view.
5. Refresh or revisit the view.
6. Confirm the entry remains associated with the test account.
7. Delete the disposable entry.
8. Confirm removal according to the application behavior.
9. Check for relevant server errors.
10. Record the result.

Do not use another person's account or financial records as test data.
If a release changes data formats, perform broader migration checks in staging before production.

## AI workflow

1. Confirm AI Core reports readiness through the intended health route.
2. Sign in with the designated test account.
3. Submit a non-sensitive test question.
4. Confirm a response arrives within an acceptable time.
5. Confirm the response is associated with the expected session.
6. Check for gateway or provider errors.
7. Record whether the test used the real provider or a mock.
8. Avoid logging the prompt if it contains private information.

A CI mock verifies platform behavior in the test environment.
A production provider test verifies only the provider and request used at that time.

## Receipt workflow

Run this section when OCR or upload behavior changes.

1. Prepare an authorized, non-sensitive test image.
2. Confirm its file type and size are within the configured limits.
3. Upload it with the designated account.
4. Confirm the application accepts or rejects it as expected.
5. Check that processing completes.
6. Review the extracted result for the test image.
7. Delete the test artifact if appropriate.
8. Inspect redacted errors if the flow fails.
9. Record the image type, approximate size and outcome.
10. Do not include a real receipt in an incident report.

The CI OCR import smoke check is narrower than end-to-end extraction.

## Email workflow

Run this section when SMTP, sender identity or email-dependent authentication changes.

1. Use an authorized test mailbox.
2. Trigger the relevant application email.
3. Confirm that it arrives within the expected period.
4. Confirm the sender and link hostname are correct.
5. Confirm the link opens the intended environment.
6. Confirm the workflow completes.
7. Check provider errors if delivery fails.
8. Do not paste the one-time link or code into a ticket.

SMTP authentication alone does not prove inbox delivery.
Review spam, provider restrictions and sender verification when relevant.

## Speech workflow

Run this section when voice or speech configuration changes.

1. Confirm the feature is enabled for the test account.
2. Use a short, non-sensitive test recording.
3. Confirm the browser has the required microphone permission.
4. Test the intended speech-to-text or text-to-speech flow.
5. Confirm the response and user-facing behavior.
6. Check provider status and quota if it fails.
7. Record the outcome without saving unnecessary audio.

## Background jobs

1. Confirm the worker container is running and healthy.
2. Select a designated test job or affected workflow.
3. Trigger the job with non-sensitive data.
4. Confirm that it is claimed and completes.
5. Check for unexpected retries or duplicate effects.
6. Inspect redacted worker logs if needed.
7. Record the job type and outcome.

A worker health ping confirms database reachability only.
It does not establish that all queued jobs are progressing.

## Resource and dependency checks

1. Check host disk space.
2. Check container health.
3. Check MongoDB writable-primary status through an authorized diagnostic path.
4. Check Redis health.
5. Check AI Core readiness.
6. Check recent service logs for repeated errors.
7. Review CPU and memory if the release changed resource use.
8. Check the provider's current error and quota status.
9. Confirm backups still run after the change.
10. Record remaining risks and owners.

## Acceptance decision

Accept the release only after the required checks for that change are complete.
If a check fails, determine user impact and whether rollback is appropriate.
Retain previous images until the agreed acceptance period ends.
Record any exception and its owner rather than silently skipping the check.
