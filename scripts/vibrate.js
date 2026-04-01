#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ButtplugClient, ButtplugNodeWebsocketClientConnector } from "buttplug";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function drainStdin() {
  if (process.stdin.isTTY) return;
  process.stdin.resume();
  process.stdin.on("data", () => {});
  // Give a tick for the pipe to flush
  await new Promise((resolve) => setTimeout(resolve, 50));
  process.stdin.destroy();
}

function parsePattern() {
  const arg = process.argv.find((a) => a.startsWith("--pattern="));
  if (!arg) {
    console.error("Usage: vibrate.js --pattern=<name>");
    process.exit(0);
  }
  return arg.split("=")[1];
}

async function loadConfig() {
  const configPath = join(__dirname, "..", "config", "patterns.json");
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw);
}

async function runPattern(patternName) {
  const config = await loadConfig();
  const pattern = config.patterns[patternName];
  if (!pattern) {
    console.error(`Unknown pattern: "${patternName}". Available: ${Object.keys(config.patterns).join(", ")}`);
    process.exit(0);
  }

  const multiplier = Math.max(0, Math.min(1, config.intensityMultiplier ?? 1.0));
  const url = config.intifaceUrl || "ws://127.0.0.1:12345";

  const client = new ButtplugClient("Claude Haptic");
  const connector = new ButtplugNodeWebsocketClientConnector(url);

  await client.connect(connector);

  const devices = client.devices.filter(
    (d) => d.vibrateAttributes.length > 0
  );

  if (devices.length === 0) {
    console.error("No vibrating devices connected in Intiface Central");
    await client.disconnect();
    process.exit(0);
  }

  for (const step of pattern.steps) {
    const intensity = Math.max(0, Math.min(1, step.intensity * multiplier));
    await Promise.all(devices.map((d) => d.vibrate(intensity)));
    if (step.ms > 0) {
      await sleep(step.ms);
    }
  }

  await Promise.all(devices.map((d) => d.stop()));
  await client.disconnect();
}

async function main() {
  const patternName = parsePattern();
  await drainStdin();
  await runPattern(patternName);
}

main().catch((err) => {
  console.error(`Haptic error: ${err.message}`);
  process.exit(0);
});
