# DNS and certificate operator guide

This guide expands [DNS and HTTPS](02-dns-https.md).
The last recorded public address was `3.106.147.122`.
The last recorded working hostname was `finwise.3-106-147-122.sslip.io`.
The requested `personalfinanceagent.dpdns.org` hostname had no public A record at the last check on 23 November 2026.

## DNS concepts

A domain registration identifies who controls a domain or subdomain.
Nameserver delegation identifies which DNS servers are authoritative for that name.
An A record maps a hostname to an IPv4 address.
Resolvers cache DNS answers for a period determined by the record and resolver behavior.
A TLS certificate binds an HTTPS hostname to a public key and is checked by the browser.
Each of these steps can fail independently.

The supplied domain certificate records the registered domain name.
It does not by itself publish an A record, configure Caddy or issue a website TLS certificate.

## Before changing records

1. Confirm access to the DigitalPlat account that owns the registration.
2. Confirm the exact hostname to configure.
3. Confirm the AWS account and region.
4. Confirm the currently associated Elastic IP in the EC2 console.
5. Confirm the instance security group permits ports 80 and 443.
6. Confirm the web service is healthy using the existing working hostname.
7. Identify the authoritative DNS provider that will host the record.
8. Record existing nameservers and records before editing them.
9. Review any existing mail or service records before changing delegation.
10. Follow the registrar's and provider's current instructions.

## Configure the hostname

1. Create or select the DNS zone supported by the chosen provider.
2. Configure the registrar's nameserver delegation as required.
3. Create an apex A record for `personalfinanceagent.dpdns.org`.
4. Use the current Elastic IP as the A record value.
5. Save the configuration.
6. Query the assigned nameservers to confirm the record exists.
7. Query an external resolver and allow for caching and propagation.
8. Check that the answer points to the intended host.

Do not add an IPv6 record unless the service is correctly configured and reachable over IPv6.
An incorrect AAAA record can cause some clients to connect to the wrong endpoint.

## Linux DNS checks

```bash
dig +short NS personalfinanceagent.dpdns.org
dig +short A personalfinanceagent.dpdns.org
dig +short AAAA personalfinanceagent.dpdns.org
```

Check the returned nameservers against the intended DNS provider.
Check the A record against the Elastic IP shown in AWS.
If different resolvers return different results, consider caching and delegation before changing records again.

## Windows DNS checks

```powershell
Resolve-DnsName personalfinanceagent.dpdns.org -Type NS
Resolve-DnsName personalfinanceagent.dpdns.org -Type A
Resolve-DnsName personalfinanceagent.dpdns.org -Type AAAA
```

An SOA or negative response is not an A record pointing to the website.
Record the check time and resolver if troubleshooting inconsistent answers.

## Caddy and HTTPS checks

The recorded EC2 configuration placed the requested name in `FINWISE_ALIASES`.
The HTTPS origin was also recorded in `CORS_ORIGINS`.
Confirm those values privately on the host without printing secret values into shared logs.
The host must receive the certificate authority's validation traffic.
Confirm that ports 80 and 443 reach the instance and that Caddy is running.

```bash
curl -fsSI https://personalfinanceagent.dpdns.org/login
```

Use a normal certificate-verifying HTTPS request.
A successful response confirms a certificate and response for that request at that time.
It does not establish that every application workflow works under that hostname.

## Browser and application checks

1. Open the alias in a fresh browser session.
2. Confirm the browser reports a trusted certificate for the intended hostname.
3. Load the login and registration screens.
4. Sign in with a designated test account.
5. Inspect failed network requests for origin or cookie problems.
6. Check the CSRF flow and session recovery when relevant.
7. Ask a non-sensitive test AI question.
8. Confirm email links and OAuth callbacks if the alias becomes canonical.
9. Repeat the checks for the original hostname if it remains supported.
10. Record the test date and outcome.

## Changing the canonical origin

`FINWISE_HOST` supplies the primary Caddy hostname.
`FINWISE_ALIASES` supplies optional additional hostnames.
`CLIENT_URL` is used as the application's canonical origin for links and related flows.
`CORS_ORIGINS` lists allowed browser origins.
Changing a canonical origin can affect users with old links or active sessions.
Coordinate provider callback settings, email templates and application configuration.
Retain a rollback plan for the previous hostname.

## Troubleshooting table

| Observation | First checks |
| --- | --- |
| No A record | Domain ownership, delegation, authoritative DNS zone and record name |
| Wrong IP | Record value, old cache and Elastic IP association |
| Connection timeout | EC2 status, routing, security group and host firewall |
| Certificate error | Hostname, Caddy logs, port 80/443 reachability and CA validation |
| Page loads but API is blocked | `CORS_ORIGINS`, browser origin, gateway and proxy logs |
| Login redirects to old name | `CLIENT_URL`, OAuth callback configuration and browser state |
| Intermittent behavior | Multiple DNS answers, caching, IPv6 and inconsistent origin settings |

Do not put DNS provider passwords, session tokens or account recovery details in the change record.
