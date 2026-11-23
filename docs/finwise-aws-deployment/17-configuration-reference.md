# Configuration reference

This reference describes settings visible in the inspected Compose and example configuration files.
Examples and defaults are not proof of the values currently configured on the EC2 host.
Read the configuration at the actual deployed SHA before making a change.
Do not print or copy secret values into documentation, tickets or shared terminal output.

## Configuration layers

The base `compose.yaml` defines the service graph.
The EC2 overlay adds Caddy and EC2-specific settings.
The newer release overlay supplies SHA-tagged image names.
The root `.env` supplies Compose interpolation values.
The server and AI Core each have an environment file.
Compose service-level `environment` entries can override values supplied by an `env_file`.
Application code can impose additional validation and defaults.

## Root environment file

The recorded path is `/opt/finwise/.env`.
It is excluded from Git and should be protected on the host.
It contains hostname, origin, service and shared-secret settings.
The actual contents must remain private.

### FINWISE_HOST

The EC2 Caddy service requires a primary hostname.
The hostname must be suitable for the intended HTTPS deployment.
Public DNS and certificate issuance must work for the name.
The last recorded primary host was the `sslip.io` name.

### FINWISE_ALIASES

The Caddy configuration supports optional additional hostnames.
The requested DigitalPlat hostname was recorded as an alias.
An alias still requires working DNS and a valid certificate.
Confirm browser origins and application behavior for each intended hostname.

### CLIENT_URL

This setting represents the canonical client origin used by the server for links and related flows.
Use an HTTPS origin for the public deployment.
Changing it can affect email links and OAuth callbacks.
Review old links and session behavior before switching the canonical domain.

### CORS_ORIGINS

The server uses this setting to decide which browser origins are permitted.
Include the intended scheme and hostname for each allowed origin.
Allow only origins that should access the application.
Test credentialed requests from the primary hostname and any supported alias.

### JWT_SECRET

This is a required production secret in the Compose configuration.
It is used for authentication token security.
Do not store it in Git or disclose it in logs.
Rotation can invalidate existing sessions.
Plan the user impact and verify login after rotation.

### AI_CORE_INTERNAL_TOKEN

This shared token protects internal calls to AI Core.
The gateway, worker and AI Core need consistent configuration.
Use an authorized secret-management process.
Test a real internal request after rotation.

### WEBHOOK_CREDENTIALS_KEY

The Compose configuration requires a base64-encoded 32-byte key.
The application uses it to protect saved webhook authorization values.
Replacing the key without a migration or access to old key material can make existing values unreadable.
Test migration or re-entry procedures in isolation before changing production.

### SERVER_REPLICAS

The base Compose file supports a configurable server replica count.
The initial EC2 configuration recorded one server replica.
Scaling changes CPU and memory usage and may change operational behavior.
Measure capacity and verify shared dependencies before changing the count.

### AI_CORE_REPLICAS

The base Compose file supports a configurable AI Core replica count.
The recorded deployment used one AI Core replica.
Some AI work limits and caches are per process or per replica.
Check aggregate provider quotas and instance capacity before scaling.

### AI_CORE_MAX_INFLIGHT

This setting controls a per-process AI work limit in the inspected configuration.
The recorded deployment used a value of two.
Increasing concurrency can increase memory, CPU and provider usage.
Test representative traffic and provider limits before raising it.

### LLM_PROVIDER and LLM_MODEL

These select the configured AI provider and model.
The initial deployment recorded Groq and `openai/gpt-oss-20b`.
Provider availability and model names can change.
Confirm the configured provider's current requirements and costs.
The `mock` provider is useful for CI and does not validate real provider access.

## Server environment file

The recorded path is `/opt/finwise/server/.env`.
It can contain SMTP, speech-provider and gateway settings.
The Compose file also supplies service-level values.
Review precedence before concluding that a value in the file is the effective runtime value.

### Email settings

The example configuration documents SMTP-related settings such as sender identity, host, port and TLS behavior.
The initial deployment recorded successful SMTP authentication.
Authentication alone does not guarantee ongoing delivery.
Test the actual registration or recovery email flow with a designated account.
Keep credentials and email links out of logs and tickets.

### Gnani settings

The example file documents optional speech service configuration.
The initial deployment recorded a configured Gnani credential.
The service provider, endpoint, model and account quota can change.
Test speech separately after changes.
Use a non-sensitive test recording.

### Google OAuth settings

The example configuration documents client ID, client secret and callback URL settings.
Google sign-in requires a separately configured OAuth application.
The callback must match the intended public origin and provider registration.
The presence of code or placeholders does not establish that sign-in is enabled.

### Feature and upload settings

The example file documents feature flags and file upload limits.
Review current application code and actual environment before changing them.
Test allowed file types and rejection behavior using safe test files.
Do not increase limits without considering memory, disk and proxy constraints.

## AI Core environment file

The recorded path is `/opt/finwise/server/AI_Core/.env`.
It holds AI provider settings and credentials.
The Compose environment also supplies state, cache and internal-token settings.
Use the deployed source to verify precedence and validation.

### Provider credentials

Store only the credentials required for authorized providers.
Check provider quota, billing and model access separately from container health.
Rotate exposed credentials at the provider and investigate the exposure.
Never paste keys into CI output or documentation.

### Mongo-backed state

The inspected Compose configuration sets AI Core state to MongoDB.
It requires the state store for readiness.
Sessions, checkpoints and memories need to be included in recovery planning.
Verify the real data and backup scope at the deployed release.

### Redis cache

The inspected Compose configuration supplies the internal Redis URL.
Redis should remain on the internal network.
Check service health and cache behavior when diagnosing related failures.

### Metrics token

The AI Core example documents an optional metrics token.
The example states that the endpoint is disabled when the token is unset.
Review the actual deployed code and network exposure before enabling it.
Monitoring definitions in the repository do not prove a monitoring stack is running.

## Change procedure

1. Identify the setting and the services that consume it.
2. Review source precedence and validation at the target SHA.
3. Determine whether the change affects users or stored data.
4. Preserve a protected recovery copy of the previous configuration.
5. Test the change in an isolated environment where possible.
6. Update the protected production configuration through authorized access.
7. Recreate the affected services using the files for the running release.
8. Check health, logs and the affected feature.
9. Record the outcome without recording secret values.
10. Revoke replaced external credentials after the new configuration is verified.

## Sensitive-output review

Avoid displaying complete environment files.
Avoid sharing resolved Compose output.
Avoid printing Docker container environment variables in a shared session.
Redact tokens, cookies, provider keys and personal data from incident logs.
Use a designated non-sensitive account and test data for verification.
