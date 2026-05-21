// Recon script — convert a DWG via CloudConvert, inspect the resulting PDF.
// Standalone, no project imports. Run: node scripts/recon-dwg-to-pdf.mjs <input.dwg>

import fs from "node:fs";
import path from "node:path";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
});

const apiKey = env.CLOUDCONVERT_API_KEY;
if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY missing in .env.local");

const inputPath = process.argv[2];
if (!inputPath) throw new Error("usage: node scripts/recon-dwg-to-pdf.mjs <input.dwg>");
if (!fs.existsSync(inputPath)) throw new Error("File not found: " + inputPath);

const fileName = path.basename(inputPath);
const outDir = "tmp/recon";
fs.mkdirSync(outDir, { recursive: true });
const outPdfPath = path.join(outDir, fileName.replace(/\.dwg$/i, ".pdf"));

const sourceBuffer = fs.readFileSync(inputPath);
console.log(`[recon] Source: ${inputPath} (${(sourceBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

const CC = "https://api.cloudconvert.com/v2";
const auth = { Authorization: `Bearer ${apiKey}` };

console.log("[recon] Creating CloudConvert job (dwg → pdf)…");
const jobResp = await fetch(`${CC}/jobs`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    tasks: {
      "import-file": { operation: "import/upload" },
      "convert-file": {
        operation: "convert",
        input: "import-file",
        input_format: "dwg",
        output_format: "pdf",
      },
      "export-file": { operation: "export/url", input: "convert-file" },
    },
  }),
});
if (!jobResp.ok) {
  console.error("[recon] Job create failed:", jobResp.status, await jobResp.text());
  process.exit(1);
}
const job = await jobResp.json();
const jobId = job.data.id;
const importTask = job.data.tasks.find((t) => t.name === "import-file");
const uploadForm = importTask?.result?.form;
if (!uploadForm?.url) throw new Error("No upload URL");

console.log("[recon] Uploading source to CloudConvert…");
const form = new FormData();
for (const [k, v] of Object.entries(uploadForm.parameters)) form.append(k, v);
form.append("file", new Blob([sourceBuffer], { type: "application/acad" }), fileName);
const uploadResp = await fetch(uploadForm.url, { method: "POST", body: form });
if (!uploadResp.ok) {
  console.error("[recon] Upload failed:", uploadResp.status, await uploadResp.text());
  process.exit(1);
}

console.log("[recon] Polling job status…");
const POLL = 3000;
const MAX = 80;
for (let i = 0; i < MAX; i++) {
  await new Promise((r) => setTimeout(r, POLL));
  const sResp = await fetch(`${CC}/jobs/${jobId}`, { headers: auth });
  if (!sResp.ok) continue;
  const s = await sResp.json();
  process.stdout.write(`.${s.data.status[0]}`);
  if (s.data.status === "finished") {
    const exp = s.data.tasks.find((t) => t.name === "export-file");
    const fileUrl = exp?.result?.files?.[0]?.url;
    if (!fileUrl) throw new Error("No export URL");
    console.log("\n[recon] Downloading converted PDF…");
    const fResp = await fetch(fileUrl);
    const ab = await fResp.arrayBuffer();
    fs.writeFileSync(outPdfPath, Buffer.from(ab));
    console.log(`[recon] Wrote ${outPdfPath} (${(ab.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    break;
  }
  if (s.data.status === "error") {
    const failed = s.data.tasks.find((t) => t.status === "error");
    console.error("\n[recon] Job error:", failed?.name, failed?.message);
    process.exit(1);
  }
}

if (!fs.existsSync(outPdfPath)) {
  console.error("[recon] Timed out");
  process.exit(1);
}

console.log("\n[recon] Reading PDF page count via pdf-lib…");
const { PDFDocument } = await import("pdf-lib");
const doc = await PDFDocument.load(fs.readFileSync(outPdfPath), { ignoreEncryption: true });
const pageCount = doc.getPageCount();
console.log(`[recon] PDF has ${pageCount} pages`);
for (let i = 0; i < Math.min(pageCount, 25); i++) {
  const p = doc.getPage(i);
  const { width, height } = p.getSize();
  console.log(`  page ${i + 1}: ${width.toFixed(0)} × ${height.toFixed(0)} pts (${(width / 72).toFixed(1)} × ${(height / 72).toFixed(1)} in)`);
}

console.log("\n[recon] Rendering first 6 pages to PNG for visual inspection…");
const { pdf } = await import("pdf-to-img");
const pages = await pdf(fs.readFileSync(outPdfPath), { scale: 1.5 });
let idx = 0;
for await (const img of pages) {
  idx++;
  if (idx > 6) break;
  const out = path.join(outDir, `${fileName.replace(/\.dwg$/i, "")}-p${idx}.png`);
  fs.writeFileSync(out, img);
  console.log(`  wrote ${out}`);
}

console.log("\n[recon] Done. Inspect the PNGs to confirm multi-drawing-per-sheet pattern.");
