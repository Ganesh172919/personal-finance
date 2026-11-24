# FinWise beginner's guide: develop, test, deploy, and maintain

This guide explains what FinWise does, where to find the code, how to make a change, how to test it, how deployment works, and what to do next.

**Status checked: 24 November 2026.** The public login page returned HTTP 200. AWS resources, CI results, provider settings, and DNS can change; verify their current state before making changes.

## 1. Website and current status

- Website: [Open FinWise](https://finwise.3-106-147-122.sslip.io/).
- Repository: [Ganesh172919/personal-finance](https://github.com/Ganesh172919/personal-finance).
- Recorded AWS release branch: [`codex/aws-deploy`](https://github.com/Ganesh172919/personal-finance/tree/codex/aws-deploy).
- Recorded AWS region: Sydney, `ap-southeast-2`.
- Recorded EC2 instance: `i-06ee1a58a13fdff40`.
- Recorded Elastic IP: `3.106.147.122`.
- Last recorded production source commit: `b70ef81024b57f328477a2420e8dff4117f553fa`. Verify this on the host before a release.
- Requested custom hostname: `personalfinanceagent.dpdns.org`. A public A record was not returned on 24 November 2026; it is not yet a verified website link.

A working login page confirms that one public page is reachable. It does not prove that all application features, backups, email, or AI providers are working.

**Most important rule:** pushing to `codex/aws-deploy` starts GitHub tests. It does **not** automatically update the website on EC2. A separate release is required after the chosen commit is reviewed and tested.

## 2. What FinWise is

FinWise is a personal finance application. Its code includes screens and workflows for transactions, budgets, insights, documents, tasks, and an AI assistant. Some features depend on configured external providers and account permissions.

| Part | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | Pages and buttons in the browser |
| API server | Node.js, Express, TypeScript | Authentication, requests, application logic, and service connections |
| AI Core | Python, FastAPI | AI workflows and related processing |
| Database | MongoDB | Application records and AI state in the recorded AWS setup |
| Cache | Redis | Caching and service coordination |
| Worker | Node.js | Background jobs |
| Web servers | Caddy and nginx | HTTPS, frontend files, and request forwarding |

A typical request follows this path:

```text
Browser -> domain name -> AWS EC2 -> Caddy (HTTPS) -> nginx -> Express API
                                                               |-> MongoDB
                                                               |-> Redis
                                                               `-> Python AI Core
```

The AWS deployment uses one EC2 host. Its database and application share that host, so a host failure can affect the whole website. The original AWS deployment began with a fresh database; local data was not migrated automatically.

## 3. Important folders

| Path | What you will find |
| --- | --- |
| `client/src/pages/` | Frontend pages, including login and receipts |
| `client/src/components/` | Reusable frontend components |
| `client/src/features/` | Feature-specific frontend code and tests |
| `client/src/hooks/` | Reusable React hooks |
| `client/package.json` | Frontend commands and dependencies |
| `server/src/routes/` | API route definitions |
| `server/src/controllers/` | Request handling |
| `server/src/services/` | Backend services and integrations |
| `server/src/models/` | Database models |
| `server/src/test/` | Server tests |
| `server/AI_Core/` | Python AI application and tests |
| `compose.yaml` | Base Docker Compose services |
| `deploy/aws/` | AWS template, Compose overlays, Caddy configuration, and release scripts |
| `.github/workflows/test.yml` | GitHub Actions test workflow on the release branch |
| `FINWISE_DEPLOYMENT_SUMMARY.md` | One-file summary of the deployment |
| `docs/finwise-aws-deployment/` | Detailed deployment and maintenance handbook |

The `main` branch and release branch can contain different changes. Inspect your branch and commit before editing.

## 4. Words you will see

- **Repository:** the project folder and its Git history.
- **Branch:** a line of work in Git. `codex/aws-deploy` is the recorded AWS release branch.
- **Commit:** a saved set of changes identified by a SHA.
- **Push:** sending commits from your computer to GitHub.
- **CI:** automated tests and checks run by GitHub Actions.
- **Deployment:** installing and starting a selected version on AWS.
- **Environment file:** configuration that may contain secrets and should not be committed.
- **Rollback:** returning the application to a previous release. This does not automatically undo database changes.

## 5. Create a safe learning copy on Windows

The existing `C:\Users\RAVIPRAKASH\personal-finance` folder contains uncommitted work. Do not reset, delete, or switch branches there without first understanding and preserving those changes. The example below creates a **new folder**.

Install or have access to Git, Node.js 24 with npm 11, and Python 3.11. You also need network access for dependencies and some test binaries. In PowerShell:

```powershell
git --version
node --version
npm --version
py -3.11 --version
```

Create a new copy where `finwise-learning` does not already exist:

```powershell
cd $env:USERPROFILE
git clone https://github.com/Ganesh172919/personal-finance.git finwise-learning
cd finwise-learning
git switch codex/aws-deploy
git status
```

`git status` shows your branch and local changes. Cloning and switching branches in the learning copy do not change the live website.

For a new feature, create your own branch from the up-to-date release branch:

```powershell
git pull --ff-only origin codex/aws-deploy
git switch -c codex/my-first-change
```

Run the pull only in a clean learning copy. If Git reports local changes, inspect and preserve them first. Pushing later requires a GitHub account with repository write access.

## 6. Install and start the project locally

Run these commands from the root of the **learning copy**. The virtual environment keeps Python packages separate from other projects.

```powershell
npm ci --prefix client
npm ci --prefix server
py -3.11 -m venv server/AI_Core/.venv
& .\server\AI_Core\.venv\Scripts\python.exe -m pip install -r server/AI_Core/requirements-dev.txt
```

Create environment files only when they do not already exist:

```powershell
if (-not (Test-Path server/.env)) {
  Copy-Item server/.env.example server/.env
}
if (-not (Test-Path server/AI_Core/.env)) {
  Copy-Item server/AI_Core/.env.example server/AI_Core/.env
}
```

Read the comments in both example files. Use **local test values**, including a unique local JWT secret. Do not copy production credentials or customer financial data into a learning environment. Example values are placeholders, not production secrets.

For an initial local experiment, select the mock AI provider in the current PowerShell session and start the root launcher:

```powershell
$env:LLM_PROVIDER = 'mock'
npm run dev
```

The launcher starts AI Core, Express, and Vite. Their usual local ports are 8001, 3000, and 5173. Open [http://localhost:5173](http://localhost:5173). Stop the launcher with **Ctrl+C**. If a service fails to start, inspect its terminal output, port conflicts, and environment settings.

The server example describes an in-memory MongoDB option for development without a MongoDB URI. It may need to download a MongoDB binary, and its data may be temporary. Use a separate local or staging database if persistence is needed; never point a learning copy at production. Redis, email, speech, OCR, and real AI features can need additional setup and credentials. A mock response only demonstrates the mock path.

## 7. Make your first frontend change

Example goal: change visible text without changing financial calculations.

1. Open the learning folder in your editor.
2. Search `client/src/pages/` and `client/src/components/` for the text.
3. Read the surrounding component and nearby test.
4. Make a small change in your feature branch.
5. Save it and check the local website.
6. Run the relevant tests, then the frontend checks:

```powershell
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

7. Review your changes with `git status` and `git diff`.
8. Check loading, empty, error, and mobile layouts when relevant.

Keep the change small enough that you can explain what changed and how you checked it. If the page depends on an API, review the server behavior before changing its assumptions.

## 8. Make a backend or AI change

For an API change, start with the route under `server/src/routes/`, then follow the controller, service, and model it uses. Read nearby tests in `server/src/test/`. Consider authentication, input validation, organization isolation, and error responses before changing data handling.

For an AI change, start in `server/AI_Core/` and inspect the relevant API, agent, utility, and tests. Use test data and mock or test credentials. AI financial answers need verification against underlying data and calculations.

Run relevant checks from the repository root:

```powershell
npm --prefix server run test:ci
npm --prefix server run build
Push-Location server/AI_Core
& .\.venv\Scripts\python.exe -m pytest tests/ -m 'not latency'
Pop-Location
```

The Python test command runs from `server/AI_Core` so its local imports resolve. The wider GitHub workflow also builds images and exercises the integration stack.

## 9. Commit and review your change

Inspect the files before staging them. Do not add `.env` files, keys, database dumps, or personal financial records.

```powershell
git status
git diff
git add client/src/pages/EXAMPLE_FILE.tsx
git commit -m "Describe the change"
git push -u origin codex/my-first-change
```

Replace the example path with your actual changed file and include related tests where appropriate. In GitHub, open a pull request from your feature branch to `codex/aws-deploy`. Review the diff and the Tests workflow. Merge according to the repository's permissions and rules after review and passing checks.

Someone with write access can also push directly to `codex/aws-deploy`. The push changes GitHub and triggers CI, but it still does not deploy to AWS. A direct push can land before checks finish if current branch rules do not prevent it.

## 10. Current CI status

Open the [release branch Actions page](https://github.com/Ganesh172919/personal-finance/actions?query=branch%3Acodex%2Faws-deploy). Each run belongs to a specific commit. Review the run for the exact commit you intend to release.

The latest run checked for this guide, [run 45160533188](https://github.com/Ganesh172919/personal-finance/actions/runs/45160533188), **failed** in the client test job. Its log reported 69 client test files and 562 tests passing, but Vitest detected an unhandled `dispatchEvent` error associated with `src/pages/Receipts.test.tsx`. The other listed jobs, including EC2 HTTPS and k6 smoke, passed. Investigate and fix or establish the cause, then confirm a complete passing run before using that commit as a release target.

An earlier [run for commit `879b9c3`](https://github.com/Ganesh172919/personal-finance/actions/runs/45135317085) passed. That is a historical result for that commit, not a guarantee about later commits or the live website.

## 11. How a tested change reaches AWS

Only perform a release once you understand the process and have authorized access to the AWS account. The recorded host is accessed through AWS Systems Manager Session Manager in `ap-southeast-2`.

Before releasing:

1. Select the **full commit SHA** and verify that the exact commit's required CI checks passed.
2. Compare it with the actual running production SHA. Review database, configuration, dependency, and infrastructure changes.
3. Confirm an encrypted, recoverable backup exists and identify its recovery point. Test restores in isolation.
4. Confirm host disk space and previous release images for rollback.
5. Plan for a possible interruption and decide how to verify the changed workflows.

The reviewed procedure is in [`deploy/aws/PRODUCTION_RUNBOOK.md`](deploy/aws/PRODUCTION_RUNBOOK.md). The release script selects a full SHA, builds or reuses tagged images, checks OCR imports, applies the containers, checks public routes, and attempts to restore the previous application release on failure. The tooling is in newer release-branch commits; the last recorded live application is older. Confirm the actual host state and prerequisites before first use.

After release, verify public login and registration, health endpoints, a designated test account, session recovery, a safe transaction, and the features changed. Test AI, email, voice, receipts, and background jobs separately when relevant. Record the deployed SHA, date, operator, CI run, and results.

Rolling back application code does not undo database writes or an incompatible migration. Restoring a backup may lose data written after that backup. Review data recovery separately.

## 12. Backups and security basics

MongoDB, Redis, Caddy, and other local data use host storage or Docker volumes. A MongoDB dump alone does not cover all volumes and configuration. Keep encrypted off-host backups, restrict access, and perform isolated restore drills. A written procedure does not prove an automated backup or a successful restore exists.

The recorded production environment files are `/opt/finwise/.env`, `/opt/finwise/server/.env`, and `/opt/finwise/server/AI_Core/.env`. They can contain secrets. Never commit them, print them into public logs, or copy production credentials to a learning environment. Rotating authentication or encryption keys can invalidate sessions or make stored data unreadable; review the procedure first.

Keep MongoDB, Redis, and AI Core on internal networks. Use authorized AWS and GitHub identities and review access. Optional monitoring files in the repository do not by themselves prove that alerts are deployed or working.

## 13. Domain and cost

The requested `personalfinanceagent.dpdns.org` domain needs the owner to sign in to the DigitalPlat account, configure the required nameserver delegation, and create an apex A record pointing to the current Elastic IP. Then verify DNS, Caddy certificate issuance, HTTPS, CORS, and login. Review email links and OAuth callbacks before making it canonical. See [DigitalPlat's instructions](https://github.com/DigitalPlatDev/FreeDomain/blob/main/documents/tutorial/platform/1.3-connect-nameservers.md).

The `sslip.io` hostname does not require a paid domain registration, but AWS compute, storage, public IPv4, snapshots, traffic, and third-party services can incur charges. Check the current AWS Billing page, credits, plan expiration, and provider quotas.

## 14. Recommended next work

These are recommendations, not claims that the work is complete:

1. **Fix the failing client CI run.** Investigate the Radix/jsdom event error in the receipts test, reproduce it, fix its cause, and confirm a full passing run for the intended release SHA.
2. **Confirm production state.** Use Session Manager to record the actual checkout, running services, image tags, health, backup status, and remaining AWS credits.
3. **Establish recoverable backups.** Set a schedule, encrypted off-host copies, alerting, and an isolated restore drill. Record recovery-time and data-loss objectives.
4. **Finish the domain setup.** Use the owner's DigitalPlat account to configure DNS, then verify the public certificate and application behavior.
5. **Review dependency security.** Earlier Python audits found remaining advisories after partial updates. Run current audits, assess them, upgrade compatibly, and rerun checks.
6. **Test a complete release in isolation.** Verify authentication, financial data isolation, transactions, AI, receipts, email, voice, background work, and recovery before a production release.
7. **Add monitoring and ownership.** Set up and test alerts for HTTPS, host health, disk, backups, job failures, provider quota, and AWS cost. Decide who receives them.
8. **Improve delivery.** Consider branch protection and pull-request checks. Automatic deployment is a separate project requiring scoped AWS access, secrets, health checks, and rollback; it is not currently configured.
9. **Plan for growth.** The single EC2 host and single MongoDB primary are failure points. Measure real usage and recovery needs before choosing a more available architecture or increasing capacity.

## 15. A beginner's learning plan

**First:** learn the difference between your local folder, a Git branch, GitHub Actions, and the running AWS server. Follow one frontend page to its API request.

**Next:** make a small text or styling change in a separate branch, run client checks, and open a pull request. Read the workflow result and review the diff.

**Then:** trace an API route through its controller, service, and database model. Add or update a meaningful test for a small behavior change.

**After that:** study the AI Core and use the mock provider. Avoid real financial data while learning. Read the release and recovery runbooks before touching production.

**Finally:** practice backup restoration and deployment in an isolated environment with an experienced operator before making a production release.

## 16. More detail

- [Deployment summary](FINWISE_DEPLOYMENT_SUMMARY.md)
- [AWS deployment handbook](docs/finwise-aws-deployment/README.md)
- [EC2 production runbook](deploy/aws/PRODUCTION_RUNBOOK.md)
- [EC2 setup guide](deploy/aws/EC2.md)
- [GitHub Actions runs](https://github.com/Ganesh172919/personal-finance/actions?query=branch%3Acodex%2Faws-deploy)

Update this guide after a verified change. Record the date, commit, checks, and unresolved issues. Keep secrets and personal financial data out of the document.
