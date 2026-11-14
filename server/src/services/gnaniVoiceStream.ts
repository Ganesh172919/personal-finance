import { createHmac } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { getEnv } from "../config/env";

const FRAME_BYTES = 1024;
const MAX_FRAMES = Math.ceil(30_000 / 32);
const MAX_STREAMS = 40;
const AUDIENCE = "finwise-gnani-voice";
const PATHS = new Set(["/api/voice/live", "/api/v1/voice/live"]);

function ticketSecret() {
  return createHmac("sha256", getEnv().JWT_SECRET).update(AUDIENCE).digest();
}

export function createVoiceTicket(userId: string, origin: string) {
  return jwt.sign({ origin }, ticketSecret(), {
    audience: AUDIENCE,
    subject: userId,
    expiresIn: 30,
    algorithm: "HS256",
  });
}

export function registerVoiceStream(server: Server) {
  const env = getEnv();
  const relay = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const activeUsers = new Set<string>();

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!request.url || !PATHS.has(request.url)) {
      if (server.listenerCount("upgrade") === 1) socket.destroy();
      return;
    }

    const origin = request.headers.origin;
    if (!env.GNANI_API_KEY || !origin || !env.CORS_ORIGINS.includes(origin) || relay.clients.size >= MAX_STREAMS) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }

    relay.handleUpgrade(request, socket, head, (client) => {
      let userId: string | undefined;
      let upstream: WebSocket | undefined;
      let ready = false;
      let committed = false;
      let frames = 0;
      let finished = false;
      const handshakeTimeout = setTimeout(() => finish(1008, "Voice connection expired"), 5_000);
      const sessionTimeout = setTimeout(() => finish(1000, "Voice turn timed out"), 40_000);

      const finish = (code: number, reason: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(handshakeTimeout);
        clearTimeout(sessionTimeout);
        if (userId) activeUsers.delete(userId);
        upstream?.terminate();
        client.close(code, reason);
      };
      const forward = (event: object) => {
        if (!finished && client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
      };
      const providerError = () => finish(1011, "Gnani live speech is unavailable. Try again or type your question.");

      client.on("error", () => finish(1011, "Voice connection interrupted"));
      client.on("close", () => finish(1000, "Voice connection closed"));
      client.on("message", (data, binary) => {
        if (finished) return;
        if (!userId) {
          if (binary) return finish(1008, "A voice ticket is required");
          try {
            const ticket = jwt.verify(data.toString(), ticketSecret(), { audience: AUDIENCE, algorithms: ["HS256"] });
            if (typeof ticket === "string" || !ticket.sub || ticket.origin !== origin || activeUsers.has(ticket.sub)) {
              return finish(1008, "Open one voice turn at a time");
            }
            userId = ticket.sub;
            activeUsers.add(userId);
          } catch {
            return finish(1008, "A valid voice ticket is required");
          }
          clearTimeout(handshakeTimeout);
          upstream = new WebSocket("wss://api.vachana.ai/stt/v3/stream", {
            headers: {
              "x-api-key-id": env.GNANI_API_KEY!,
              language_code: "indic-auto",
              model: "prisma-v3.0",
              format: "transcribe",
              "x-sample-rate": "16000",
              "x-min-silence-ms": "650",
            },
            handshakeTimeout: 6_000,
            maxPayload: 32_768,
            perMessageDeflate: false,
          });
          upstream.on("error", providerError);
          upstream.on("close", providerError);
          upstream.on("message", (raw) => {
            if (finished) return;
            try {
              const event = JSON.parse(raw.toString());
              switch (event.type) {
                case "connected":
                  ready = true;
                  forward({ type: "ready" });
                  break;
                case "speech_start":
                case "processing":
                  forward({ type: event.type });
                  break;
                case "transcript":
                  if (event.is_final && typeof event.text === "string" && event.text.trim()) {
                    forward({ type: "transcript", text: event.text.trim().slice(0, 8000), language: event.detected_language_code });
                    finish(1000, "Transcript ready");
                  }
                  break;
                case "error":
                  providerError();
                  break;
              }
            } catch {
              providerError();
            }
          });
          return;
        }

        if (!ready || !upstream || upstream.readyState !== WebSocket.OPEN || committed) return;
        if (upstream.bufferedAmount > 65_536) return finish(1013, "Voice connection is slow. Try again.");
        if (!binary) {
          if (data.toString() !== "commit") return finish(1003, "Unknown voice control");
          committed = true;
          upstream.send(JSON.stringify({ type: "commit" }));
          return;
        }
        if (!Buffer.isBuffer(data) || data.length !== FRAME_BYTES || ++frames > MAX_FRAMES) {
          return finish(1009, "Voice turns are limited to 30 seconds");
        }
        upstream.send(data, { binary: true });
      });
    });
  };

  server.on("upgrade", onUpgrade);
  return () => {
    server.off("upgrade", onUpgrade);
    for (const client of relay.clients) client.terminate();
    relay.close();
  };
}
