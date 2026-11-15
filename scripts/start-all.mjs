#!/usr/bin/env node
/**
 * scripts/start-all.mjs
 * =====================
 * FinWise Unified Full-Stack Service Launcher
 *
 * Runs all three core tiers in a single command with unified,
 * color-coded log output, active HTTP health probing, and clean shutdown:
 *   1. Python AI Core  (FastAPI / LangGraph) -> http://127.0.0.1:8001
 *   2. Node Server     (Express 5 Gateway)  -> http://127.0.0.1:3000
 *   3. Client SPA      (Vite + React 18)    -> http://127.0.0.1:5173
 *
 * Usage:
 *   npm run dev
 *   or: node scripts/start-all.mjs
 */

import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import http from "http";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const isWin = process.platform === "win32";

// Terminal colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const services = [
  {
    key: "ai-core",
    name: "AI-CORE",
    color: colors.magenta,
    port: 8001,
    url: "http://127.0.0.1:8001",
    healthUrl: "http://127.0.0.1:8001/health",
    cwd: path.join(rootDir, "server", "AI_Core"),
    ready: false,
  },
  {
    key: "server",
    name: "SERVER ",
    color: colors.cyan,
    port: 3000,
    url: "http://127.0.0.1:3000",
    healthUrl: "http://127.0.0.1:3000/readyz",
    cwd: path.join(rootDir, "server"),
    ready: false,
  },
  {
    key: "client",
    name: "CLIENT ",
    color: colors.green,
    port: 5173,
    url: "http://127.0.0.1:5173",
    healthUrl: "http://127.0.0.1:5173/",
    cwd: path.join(rootDir, "client"),
    ready: false,
  },
];

const children = [];
let isShuttingDown = false;
let allAnnounced = false;

function checkPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(port, "127.0.0.1");
  });
}

function probeHttp(targetUrl, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

function resolveUvicornCommand() {
  const aiCoreDir = path.join(rootDir, "server", "AI_Core");
  const venvPython = path.join(aiCoreDir, ".venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python");
  return {
    cmd: fs.existsSync(venvPython) ? venvPython : isWin ? "python" : "python3",
    args: ["-m", "uvicorn", "api_service:app", "--host", "127.0.0.1", "--port", String(services[0].port)],
  };
}

function resolveServerCommand() {
  const tsxCli = path.join(rootDir, "server", "node_modules", "tsx", "dist", "cli.mjs");
  if (fs.existsSync(tsxCli)) {
    return { cmd: process.execPath, args: [tsxCli, "src/server.ts"] };
  }
  const npmCmd = isWin ? "npm.cmd" : "npm";
  return { cmd: npmCmd, args: ["run", "dev"] };
}

function resolveClientCommand() {
  const viteCli = path.join(rootDir, "client", "node_modules", "vite", "bin", "vite.js");
  const viteArgs = ["--host", "127.0.0.1", "--port", String(services[2].port), "--strictPort"];
  if (fs.existsSync(viteCli)) {
    return { cmd: process.execPath, args: [viteCli, ...viteArgs] };
  }
  const npmCmd = isWin ? "npm.cmd" : "npm";
  return { cmd: npmCmd, args: ["run", "dev", "--", ...viteArgs] };
}

function pipeOutput(stream, prefix, color) {
  if (!stream) return;
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    if (isShuttingDown) return;
    const cleanLine = line.replace(/[\r\n]+$/, "");
    if (!cleanLine.trim()) return;
    console.log(`${color}${prefix}${colors.reset} ${cleanLine}`);
  });
}

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (isWin) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${colors.yellow}${colors.bold}[FINWISE] Gracefully shutting down all services...${colors.reset}`);

  for (const item of children) {
    if (item.child) {
      console.log(`  ${colors.dim}Stopping ${item.name} (PID ${item.child.pid})...${colors.reset}`);
      killProcessTree(item.child);
    }
  }

  setTimeout(() => {
    console.log(`${colors.green}[FINWISE] All services stopped. Goodbye!${colors.reset}\n`);
    process.exit(exitCode);
  }, 1000);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
  }
  const stdInRl = readline.createInterface({ input: process.stdin });
  stdInRl.on("line", (line) => {
    if (line.trim().toLowerCase() === "q") {
      shutdown(0);
    }
  });
}

function startHealthProbeLoop() {
  const interval = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(interval);
      return;
    }

    for (const svc of services) {
      if (!svc.ready) {
        const ok = await probeHttp(svc.healthUrl);
        if (ok) {
          svc.ready = true;
          console.log(`\x1b[32m[READY]\x1b[0m ${svc.color}${svc.name.trim()}${colors.reset} is live and accepting requests at ${colors.bold}${svc.url}${colors.reset}`);
        }
      }
    }

    const allReady = services.every((s) => s.ready);
    if (allReady && !allAnnounced) {
      allAnnounced = true;
      clearInterval(interval);
      console.log(`\n${colors.bold}${colors.green}================================================================================${colors.reset}`);
      console.log(`${colors.bold}${colors.green}     FINWISE LOCAL HEALTH CHECKS PASSED                                      ${colors.reset}`);
      console.log(`${colors.bold}${colors.green}================================================================================${colors.reset}`);
      console.log(`  🟢 ${colors.bold}FinanceOS Cockpit:${colors.reset} ${colors.cyan}${services[2].url}${colors.reset}   (Client Interface)`);
      console.log(`  🔷 ${colors.bold}API Gateway:${colors.reset}  ${colors.cyan}${services[1].url}${colors.reset}   (Express 5 Backend)`);
      console.log(`  🧠 ${colors.bold}AI Core Docs:${colors.reset}      ${colors.cyan}http://127.0.0.1:8001/docs${colors.reset} (FastAPI / LangGraph)`);
      console.log(`${colors.bold}${colors.green}================================================================================${colors.reset}`);
      console.log(`  ${colors.yellow}Press Ctrl+C or type 'q' + Enter to stop all services.${colors.reset}\n`);
    }
  }, 1000);
  interval.unref();
}

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}         FINWISE UNIFIED SERVICE LAUNCHER (Client + Server + AI Core)          ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`  ${colors.magenta}${colors.bold}🧠 AI Core:${colors.reset}    http://127.0.0.1:8001  (Python 3.11 + FastAPI + LangGraph)`);
  console.log(`  ${colors.cyan}${colors.bold}🔷 API Server:${colors.reset} ${services[1].url}   (Node 24 LTS + Express 5 Gateway)`);
  console.log(`  ${colors.green}${colors.bold}🟢 Web Client:${colors.reset} ${services[2].url}   (React 18 + FinanceOS Cockpit)`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`  ${colors.yellow}Commands: Press Ctrl+C or type 'q' + Enter to stop all services.${colors.reset}\n`);

  // 1. Port Availability Pre-flight check
  console.log(`${colors.dim}[1/2] Checking port availability...${colors.reset}`);
  for (const svc of services) {
    const isFree = await checkPort(svc.port);
    if (!isFree) {
      throw new Error(`Port ${svc.port} (${svc.name.trim()}) is already in use. Stop the existing process before restarting the stack.`);
    } else {
      console.log(`  ${colors.green}✓${colors.reset} Port ${svc.port} available for ${svc.name.trim()}`);
    }
  }

  // 2. Launch Services Concurrently
  console.log(`\n${colors.dim}[2/2] Starting all 3 services concurrently...${colors.reset}\n`);

  // A. Python AI Core
  const uvicornInfo = resolveUvicornCommand();
  const aiCoreChild = spawn(uvicornInfo.cmd, uvicornInfo.args, {
    cwd: services[0].cwd,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    shell: false,
  });
  children.push({ name: "AI Core", child: aiCoreChild });
  pipeOutput(aiCoreChild.stdout, "[AI-CORE]", colors.magenta);
  pipeOutput(aiCoreChild.stderr, "[AI-CORE]", colors.magenta);
  aiCoreChild.on("error", (err) => {
    console.error(`${colors.red}[AI-CORE ERROR] Failed to start AI Core:${colors.reset}`, err.message);
    shutdown(1);
  });
  aiCoreChild.on("exit", (code) => {
    if (!isShuttingDown) {
      console.log(`${colors.red}[AI-CORE] Exited with code ${code}${colors.reset}`);
      shutdown(1);
    }
  });

  // B. Express Server Gateway
  const serverCmd = resolveServerCommand();
  const serverChild = spawn(serverCmd.cmd, serverCmd.args, {
    cwd: services[1].cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      PORT: String(services[1].port),
      PYTHON_API_URL: services[0].url,
      CLIENT_URL: services[2].url,
      CORS_ORIGINS: services[2].url,
    },
    shell: false,
  });
  children.push({ name: "Server", child: serverChild });
  pipeOutput(serverChild.stdout, "[SERVER ]", colors.cyan);
  pipeOutput(serverChild.stderr, "[SERVER ]", colors.cyan);
  serverChild.on("error", (err) => {
    console.error(`${colors.red}[SERVER ERROR] Failed to start Server:${colors.reset}`, err.message);
    shutdown(1);
  });
  serverChild.on("exit", (code) => {
    if (!isShuttingDown) {
      console.log(`${colors.red}[SERVER] Exited with code ${code}${colors.reset}`);
      shutdown(1);
    }
  });

  // C. React Web Client
  const clientCmd = resolveClientCommand();
  const clientChild = spawn(clientCmd.cmd, clientCmd.args, {
    cwd: services[2].cwd,
    env: { ...process.env, FORCE_COLOR: "1", VITE_API_PROXY_TARGET: services[1].url },
    shell: false,
  });
  children.push({ name: "Client", child: clientChild });
  pipeOutput(clientChild.stdout, "[CLIENT ]", colors.green);
  pipeOutput(clientChild.stderr, "[CLIENT ]", colors.green);
  clientChild.on("error", (err) => {
    console.error(`${colors.red}[CLIENT ERROR] Failed to start Client:${colors.reset}`, err.message);
    shutdown(1);
  });
  clientChild.on("exit", (code) => {
    if (!isShuttingDown) {
      console.log(`${colors.red}[CLIENT] Exited with code ${code}${colors.reset}`);
      shutdown(1);
    }
  });

  // Start polling health endpoints in background to signal readiness
  startHealthProbeLoop();
}

main().catch((err) => {
  console.error(`${colors.red}[FATAL] Runner error:${colors.reset}`, err);
  shutdown(1);
});
