// Try CloudConvert with paper-space layout export options.
import fs from "node:fs";
import path from "node:path";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
});

const apiKey = env.CLOUDCONVERT_API_KEY;
const inputPath = process.argv[2];
if (!inputPath) throw new Error("usage: node scripts/recon-dwg-paperspace.mjs <input.dwg>");

const fileName = path.basename(inputPath);
const tag = process.argv[3] || "paperspace";
const outDir = "tmp/recon";
fs.mkdirSync(outDir, { recursive: true });

const sourceBuffer = fs.readFileSync(inputPath);
console.log(`[recon] ${tag}: source ${(sourceBuffer.length / 1024 / 1024).toFixed(2)}MB`);

const CC = "https://api.cloudconvert.com/v2";
const auth = { Authorization: `Bearer ${apiKey}` };

// Variant: explicitly request all layouts (paper space) via CloudConvert options.
// CloudConvert exposes engine-level options under `engine_version` + custom kv.
// For DWG the underlying engine is ODA File Converter / autocad. Options to try:
//   - all_layouts: true
//   - export_layouts: "all" | "model" | "paper"
//   - layout_name: specific name
//   - paper_size: A1, A3, etc.
const convertOptions = {
  all_layouts: true,
};

console.log(`[recon] convert options: ${JSON.stringify(convertOptions)}`);

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
        ...convertOptions,
      },
      "export-file": { operation: "export/url", input: "convert-file" },
    },
  }),
});
if (!jobResp.ok) {
  console.error("[recon] job create failed:", jobResp.status, await jobResp.text());
  process.exit(1);
}
const job = await jobResp.json();
const jobId = job.data.id;
const upForm = job.data.tasks.find((t) => t.name === "import-file")?.result?.form;
if (!upForm?.url) throw new Error("No upload URL");

const form = new FormData();
for (const [k, v] of Object.entries(upForm.parameters)) form.append(k, v);
form.append("file", new Blob([sourceBuffer], { type: "application/acad" }), fileName);
const uploadResp = await fetch(upForm.url, { method: "POST", body: form });
if (!uploadResp.ok) {
  console.error("[recon] upload failed:", uploadResp.status, await uploadResp.text());
  process.exit(1);
}

for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const sResp = await fetch(`${CC}/jobs/${jobId}`, { headers: auth });
  if (!sResp.ok) continue;
  const s = await sResp.json();
  process.stdout.write(`.${s.data.status[0]}`);
  if (s.data.status === "finished") {
    const fileUrl = s.data.tasks.find((t) => t.name === "export-file")?.result?.files?.[0]?.url;
    const fResp = await fetch(fileUrl);
    const ab = await fResp.arrayBuffer();
    const outPdf = path.join(outDir, fileName.replace(/\.dwg$/i, `--${tag}.pdf`));
    fs.writeFileSync(outPdf, Buffer.from(ab));
    console.log(`\n[recon] Wrote ${outPdf} (${(ab.byteLength / 1024 / 1024).toFixed(2)}MB)`);

    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(fs.readFileSync(outPdf), { ignoreEncryption: true });
    const pageCount = doc.getPageCount();
    console.log(`[recon] PDF has ${pageCount} pages`);
    for (let p = 0; p < Math.min(pageCount, 30); p++) {
      const pg = doc.getPage(p);
      const sz = pg.getSize();
      console.log(`  page ${p + 1}: ${sz.width.toFixed(0)} × ${sz.height.toFixed(0)} pts`);
    }
    if (pageCount > 1 || pageCount === 1) {
      const { pdf } = await import("pdf-to-img");
      const pages = await pdf(fs.readFileSync(outPdf), { scale: 1.5 });
      let idx = 0;
      for await (const img of pages) {
        idx++;
        if (idx > 8) break;
        const out = path.join(outDir, `${fileName.replace(/\.dwg$/i, "")}--${tag}-p${idx}.png`);
        fs.writeFileSync(out, img);
        console.log(`  wrote ${out}`);
      }
    }
    process.exit(0);
  }
  if (s.data.status === "error") {
    const failed = s.data.tasks.find((t) => t.status === "error");
    console.error("\n[recon] job error:", failed?.name, JSON.stringify(failed?.message));
    process.exit(1);
  }
}
console.error("[recon] timed out");
