import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { HttpError } from "../middleware/httpError";

const WEBHOOK_TIMEOUT_MS = 8_000;

// Inspects IPv4 octets to identify reserved, private, loopback, or multicast ranges.
// Evaluates RFC 1918, RFC 3927 link-local, RFC 6598 CGNAT, and loopback blocks.
// Prevents Server-Side Request Forgery attacks targeting internal infrastructure.
const isPrivateIpv4 = (address: string) => {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
};

// Determines whether an IP address belongs to internal or non-routable address spaces.
// Accommodates IPv4, IPv6 loopbacks, link-local addresses, and IPv4-mapped IPv6 strings.
// Ensures strict egress isolation by verifying IP boundaries before HTTP requests.
const isPrivateAddress = (address: string) => {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;

  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4[1]) : false;
};

/**
 * Validates an outbound webhook target before any user-controlled payload is
 * sent. DNS answers are checked too, so host names that resolve to a private
 * service cannot be used to pivot from the public API into internal networks.
 */
// Validates outbound webhook URLs against protocol requirements and SSRF hazards.
// Enforces standard HTTPS scheme, rejects non-standard ports, and resolves host DNS.
// Throws validation errors if resolved addresses point to internal network endpoints.
export const validateOutboundWebhookUrl = async (rawUrl: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "UNSAFE_WEBHOOK_URL", "Webhook URL must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    throw new HttpError(400, "UNSAFE_WEBHOOK_URL", "Webhook URL must use HTTPS on the default port");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new HttpError(400, "UNSAFE_WEBHOOK_URL", "Webhook URL cannot target a local address");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new HttpError(400, "UNSAFE_WEBHOOK_URL", "Webhook URL cannot target a private address");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError(400, "UNSAFE_WEBHOOK_URL", "Webhook host could not be resolved");
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new HttpError(400, "UNSAFE_WEBHOOK_URL", "Webhook URL cannot target a private address");
  }

  return url;
};

/** Performs a bounded, no-redirect request to a validated public webhook. */
// Executes safe outbound HTTP requests to validated third-party webhook endpoints.
// Enforces request timeouts and strictly disables automatic HTTP redirection.
// Delivers webhook notifications securely without risking internal service pivoting.
export const fetchOutboundWebhook = async (rawUrl: string, init: RequestInit) => {
  const url = await validateOutboundWebhookUrl(rawUrl);
  return fetch(url.toString(), {
    ...init,
    redirect: "error",
    signal: init.signal || AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
};
