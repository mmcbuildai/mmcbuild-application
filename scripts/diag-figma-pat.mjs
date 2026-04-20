#!/usr/bin/env node
/**
 * Verify FIGMA_PAT is loaded and valid against the Figma API.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import https from "https";

const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !process.env[key.trim()])
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  });
}

const pat = process.env.FIGMA_PAT;

console.log("\n════ FIGMA_PAT diagnostic ════\n");

if (!pat) {
  console.log("✗ FIGMA_PAT not found in .env.local");
  console.log("  Make sure the key is written as FIGMA_PAT (underscore, not hyphen)");
  console.log("  Example line: FIGMA_PAT=figd_abc123...");
  process.exit(1);
}

console.log(`Key present?    Yes`);
console.log(`Length:         ${pat.length} chars`);
console.log(`Starts with:    "${pat.slice(0, 5)}..."`);
console.log(`Ends with:      "...${pat.slice(-4)}"`);
console.log(`Expected:       prefix "figd_"`);
if (!pat.startsWith("figd_")) {
  console.log("\n⚠️  Value doesn't start with 'figd_' — may be wrong token format");
}

console.log("\nProbing https://api.figma.com/v1/me ...");
const result = await new Promise((resolve) => {
  const req = https.request({
    hostname: "api.figma.com",
    path: "/v1/me",
    method: "GET",
    headers: { "X-Figma-Token": pat },
  }, (res) => {
    let raw = "";
    res.on("data", (c) => (raw += c));
    res.on("end", () => resolve({ status: res.statusCode, body: raw.slice(0, 500) }));
  });
  req.on("error", (e) => resolve({ status: 0, body: e.message }));
  req.end();
});

console.log(`Status:         ${result.status}`);
if (result.status === 200) {
  try {
    const me = JSON.parse(result.body);
    console.log(`Account:        ${me.email} (${me.handle ?? "no handle"})`);
    console.log(`Verdict:        ✅ PAT is valid\n`);
  } catch {
    console.log(`Body:           ${result.body}`);
  }
} else {
  console.log(`Body:           ${result.body}`);
  console.log(`Verdict:        ✗ PAT rejected`);
}
