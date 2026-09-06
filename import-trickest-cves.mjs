import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const sourceDir = process.env.TRICKEST_CVE_DIR ?? "/tmp/trickest-cve/2026";
const reportPath = process.env.TRICKEST_IMPORT_REPORT ?? "/tmp/trickest-cve-import-report.json";
const batchSize = 150;

function fromBadge(markdown, label) {
  const pattern = new RegExp(`label=${label}&message=([^&\\)]+)`, "i");
  const value = markdown.match(pattern)?.[1];
  return value ? decodeURIComponent(value).replace(/\+/g, " ").trim() : "";
}

function clip(value, size) {
  return value.replace(/\s+/g, " ").trim().slice(0, size);
}

function parseCve(filename, markdown) {
  const cveNumber = filename.replace(/\.md$/i, "");
  const description = markdown.match(/### Description\s*\n+([\s\S]*?)(?=\n+### |\n+#### |$)/i)?.[1] ?? "No description provided in the source file.";
  const product = fromBadge(markdown, "Product") || "See source";
  const vulnerability = fromBadge(markdown, "Vulnerability") || "Vulnerability record";

  return [
    cveNumber,
    clip(`${cveNumber} — ${vulnerability}`, 255),
    clip(description, 60000),
    "medium",
    "N/A",
    "2026",
    clip(product, 255),
    `https://github.com/trickest/cve/blob/main/2026/${encodeURIComponent(filename)}`,
  ];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const files = (await fs.readdir(sourceDir)).filter(file => /^CVE-2026-\d+\.md$/i.test(file)).sort();
  const records = [];
  for (const file of files) {
    const markdown = await fs.readFile(path.join(sourceDir, file), "utf8");
    records.push(parseCve(file, markdown));
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const sql = `INSERT INTO cves (cveNumber, title, description, severity, cvss, publishedDate, affected, sourceUrl)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      title = VALUES(title), description = VALUES(description),
      affected = VALUES(affected), sourceUrl = VALUES(sourceUrl)`;
  let processed = 0;
  try {
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      await connection.query(sql, [batch]);
      processed += batch.length;
      console.log(`Imported ${processed}/${records.length}`);
    }
  } finally {
    await connection.end();
  }

  const report = {
    source: "https://github.com/trickest/cve/tree/main/2026",
    sourceDir,
    totalFiles: files.length,
    processed,
    importedAt: new Date().toISOString(),
    notes: "Trickest Markdown supplies identifier, description and product labels. CVSS and exact publication date remain N/A/2026 until NVD enriches them.",
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
