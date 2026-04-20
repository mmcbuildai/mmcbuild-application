#!/usr/bin/env node
/**
 * Figma sync — pull a Figma file via REST API and write:
 *   - design/<slug>-tree.json       node tree (metadata, for Claude reference)
 *   - design/<slug>-tokens.json     extracted colour + text styles
 *   - design/<slug>-frames/*.png    2x PNG renders of top-level frames
 *
 * Usage:
 *   node scripts/figma-sync.mjs <file-key-or-url>
 *
 * Examples:
 *   node scripts/figma-sync.mjs ZTLA7Ak99hHRYkZKfFezW0
 *   node scripts/figma-sync.mjs https://www.figma.com/file/ABC/Some-File
 *   node scripts/figma-sync.mjs https://www.figma.com/design/ABC/Some-File
 *   node scripts/figma-sync.mjs https://www.figma.com/board/ABC/Some-Board
 *
 * Does NOT support /make/ URLs — Figma Make files are not exposed via REST API.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
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

const PAT = process.env.FIGMA_PAT;
if (!PAT) {
  console.error("✗ FIGMA_PAT not set in .env.local");
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/figma-sync.mjs <file-key-or-url>");
  process.exit(1);
}

function parseKey(input) {
  if (/^[A-Za-z0-9_-]{15,30}$/.test(input)) return input;
  const m = input.match(/figma\.com\/(file|design|board|make)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`Could not parse file key from: ${input}`);
  if (m[1] === "make") {
    throw new Error("Figma Make files (/make/) are not supported by the REST API. Use Dev Mode in browser instead.");
  }
  return m[2];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await new Promise((resolve) => {
      const req = https.request({
        hostname: "api.figma.com",
        path,
        method: "GET",
        headers: { "X-Figma-Token": PAT, ...(opts.headers || {}) },
      }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: raw }));
      });
      req.on("error", (e) => resolve({ status: 0, body: e.message }));
      req.setTimeout(60000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
      req.end();
    });

    if (result.status === 429) {
      const wait = 2000 * Math.pow(2, attempt);
      console.log(`    (429 rate-limited, waiting ${wait / 1000}s...)`);
      await sleep(wait);
      continue;
    }
    if (result.status >= 400) {
      throw new Error(`${path} → ${result.status}: ${result.body.slice(0, 300)}`);
    }
    try { return JSON.parse(result.body); } catch { return result.body; }
  }
  throw new Error(`${path} rate-limited after retries`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`download ${res.statusCode} ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        writeFileSync(dest, Buffer.concat(chunks));
        resolve();
      });
    }).on("error", reject);
  });
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function walk(node, out = []) {
  if (!node) return out;
  const entry = {
    id: node.id,
    name: node.name,
    type: node.type,
    ...(node.absoluteBoundingBox ? { bounds: node.absoluteBoundingBox } : {}),
    ...(node.fills?.length ? { fills: node.fills } : {}),
    ...(node.strokes?.length ? { strokes: node.strokes } : {}),
    ...(node.cornerRadius != null ? { cornerRadius: node.cornerRadius } : {}),
    ...(node.styles ? { styles: node.styles } : {}),
  };
  out.push(entry);
  if (Array.isArray(node.children)) {
    entry.childIds = node.children.map((c) => c.id);
    for (const c of node.children) walk(c, out);
  }
  return out;
}

function extractTokens(file) {
  const colours = {};
  const textStyles = {};

  function visit(node) {
    if (!node) return;
    // Solid-paint fills become colour tokens if the node has a named colour style
    if (node.styles?.fill && node.fills?.length) {
      const paint = node.fills.find((f) => f.type === "SOLID");
      if (paint) {
        const styleId = node.styles.fill;
        const style = file.styles?.[styleId];
        if (style) {
          colours[style.name] = rgbaToHex(paint.color, paint.opacity ?? 1);
        }
      }
    }
    if (node.styles?.text && node.style) {
      const styleId = node.styles.text;
      const style = file.styles?.[styleId];
      if (style) {
        textStyles[style.name] = {
          fontFamily: node.style.fontFamily,
          fontWeight: node.style.fontWeight,
          fontSize: node.style.fontSize,
          lineHeight: node.style.lineHeightPx,
          letterSpacing: node.style.letterSpacing,
        };
      }
    }
    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
  }

  visit(file.document);
  return { colours, textStyles };
}

function rgbaToHex(c, opacity) {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = (c.a ?? 1) * (opacity ?? 1);
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return a < 1 ? `${hex} (α=${a.toFixed(2)})` : hex;
}

async function main() {
  const key = parseKey(arg);
  console.log(`\nFetching file ${key}...`);
  const file = await api(`/v1/files/${key}`);
  const slug = slugify(file.name);
  console.log(`  name: ${file.name}`);
  console.log(`  slug: ${slug}`);
  console.log(`  last modified: ${file.lastModified}`);

  const outDir = join(process.cwd(), "design");
  const framesDir = join(outDir, `${slug}-frames`);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });

  // 1) Tree metadata
  const tree = walk(file.document);
  writeFileSync(join(outDir, `${slug}-tree.json`), JSON.stringify(tree, null, 2));
  console.log(`\n✓ Tree → design/${slug}-tree.json (${tree.length} nodes)`);

  // 2) Tokens
  const tokens = extractTokens(file);
  writeFileSync(
    join(outDir, `${slug}-tokens.json`),
    JSON.stringify({ source: file.name, exported: new Date().toISOString(), ...tokens }, null, 2)
  );
  console.log(`✓ Tokens → design/${slug}-tokens.json (${Object.keys(tokens.colours).length} colours, ${Object.keys(tokens.textStyles).length} text styles)`);

  // 3) Render top-level frames per page
  const pages = file.document.children;
  const topFrames = [];
  for (const page of pages) {
    if (!Array.isArray(page.children)) continue;
    for (const child of page.children) {
      if (child.type === "FRAME" || child.type === "SECTION" || child.type === "COMPONENT") {
        topFrames.push({ id: child.id, name: `${page.name} – ${child.name}` });
      }
    }
  }

  if (topFrames.length === 0) {
    console.log(`\n(no top-level frames/sections to render)`);
    console.log(`\nDone.`);
    return;
  }

  console.log(`\nRendering ${topFrames.length} frames individually (2x, with 1x fallback)...`);
  let downloaded = 0;
  let skipped = 0;
  for (const frame of topFrames) {
    const fname = `${slugify(frame.name)}.png`;
    let url = null;
    for (const scale of [2, 1]) {
      try {
        const resp = await api(
          `/v1/images/${key}?ids=${encodeURIComponent(frame.id)}&format=png&scale=${scale}`
        );
        url = resp.images?.[frame.id];
        if (url) {
          if (scale === 1) console.log(`  (fell back to 1x for ${frame.name})`);
          break;
        }
      } catch (e) {
        if (scale === 1) {
          console.log(`  ✗ ${frame.name} → ${e.message.split("\n")[0]}`);
        }
      }
    }
    if (!url) {
      skipped++;
      continue;
    }
    try {
      await download(url, join(framesDir, fname));
      console.log(`  ✓ ${frame.name} → ${fname}`);
      downloaded++;
    } catch (e) {
      console.log(`  ✗ ${frame.name} download failed: ${e.message}`);
      skipped++;
    }
    await sleep(1200); // space out render requests to stay under 60/min
  }
  console.log(`\n✓ Frames → design/${slug}-frames/ (${downloaded} downloaded, ${skipped} skipped)\n`);

  console.log("Done. Review the design/ folder and commit whatever you want to track.\n");
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
