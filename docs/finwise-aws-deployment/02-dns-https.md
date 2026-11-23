# DNS and HTTPS

## Working hostname

The recorded public URL is [https://finwise.3-106-147-122.sslip.io/](https://finwise.3-106-147-122.sslip.io/). The hostname encodes the instance's recorded public IP address. Caddy terminates HTTPS on the host and forwards traffic to nginx.

On 23 November 2026 `/login` returned HTTP 200 over HTTPS. That observation verifies one public page request at that time. It does not establish that all accounts, email delivery, AI providers or recovery procedures are functioning.

## Requested DigitalPlat hostname

The supplied domain certificate identifies `personalfinanceagent.dpdns.org`. A domain certificate does not configure DNS or by itself make the website reachable. The last recorded DNS check found no public A record for this hostname.

The recorded EC2 Caddy configuration includes the hostname as an alias, and the API origin allowlist includes its HTTPS origin. Those settings do not replace the need for a working DNS delegation and an A record.

## Activate the alias

1. Sign in to the DigitalPlat account that owns the domain registration.
2. Choose an authoritative DNS provider and configure the nameservers required by that provider and DigitalPlat.
3. Create an apex A record for `personalfinanceagent.dpdns.org` pointing to the current Elastic IP. The last recorded address is `3.106.147.122`.
4. Confirm the name resolves publicly and that the answer matches the intended address.
5. Confirm TCP ports 80 and 443 reach the EC2 host.
6. Inspect Caddy logs and wait for a trusted certificate to be issued.
7. Open the alias over HTTPS, test sign-in and verify browser requests are accepted.
8. Record the date, DNS provider, record and verification outcome in the deployment record without recording account passwords.

Consult [DigitalPlat's nameserver instructions](https://github.com/DigitalPlatDev/FreeDomain/blob/main/documents/tutorial/platform/1.3-connect-nameservers.md) for the registrar's current process.

## Check resolution and the certificate

On a system with `dig` and `curl` installed:

```bash
dig +short NS personalfinanceagent.dpdns.org
dig +short A personalfinanceagent.dpdns.org
curl -fsSI https://personalfinanceagent.dpdns.org/login
```

On Windows PowerShell, `Resolve-DnsName personalfinanceagent.dpdns.org -Type A` can check DNS. DNS caching can make answers differ temporarily. Confirm which nameservers are authoritative before changing records repeatedly.

## Choosing a canonical URL

`FINWISE_HOST` controls Caddy's primary hostname. `FINWISE_ALIASES` lists additional names. `CLIENT_URL` represents the canonical application origin for links and related flows. `CORS_ORIGINS` lists allowed browser origins.

If the DigitalPlat name becomes canonical, review email links, cookie behavior, CORS and any Google OAuth callback registration. Test both names from a fresh browser session. A hostname change can affect user sessions and links already sent by email.

## Certificate troubleshooting

If Caddy cannot obtain a certificate, check public DNS, port 80 and 443 access, the security group, the instance's Elastic IP association and Caddy logs. Check the exact hostname and any CA error message. Do not repeatedly delete Caddy's persistent data or retry certificate issuance without understanding the failure.
