import { describe, expect, it } from "vitest";

import { validateOutboundWebhookUrl } from "../services/outboundWebhook";

describe("outbound webhook validation", () => {
  it.each([
    "http://example.com/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://user:secret@example.com/hook",
    "https://example.com:8443/hook",
  ])("rejects unsafe destination %s", async (url) => {
    await expect(validateOutboundWebhookUrl(url)).rejects.toMatchObject({
      statusCode: 400,
      code: "UNSAFE_WEBHOOK_URL",
    });
  });
});
