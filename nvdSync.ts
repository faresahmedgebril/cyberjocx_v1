import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { cves, getDb, nvdSyncRuns, nvdSyncSettings } from "./db";
import { sdk } from "./_core/sdk";

type NvdVulnerability = {
  cve?: {
    id?: string;
    descriptions?: Array<{ lang?: string; value?: string }>;
    published?: string;
    metrics?: Record<string, Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>>;
    configurations?: Array<{ nodes?: Array<{ cpeMatch?: Array<{ criteria?: string }> }> }>;
  };
};

function severityOf(cve: NonNullable<NvdVulnerability["cve"]>) {
  const metric = cve.metrics?.cvssMetricV40?.[0] ?? cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0];
  const raw = metric?.cvssData?.baseSeverity?.toLowerCase() ?? "medium";
  return (["critical", "high", "medium", "low"].includes(raw) ? raw : "medium") as "critical" | "high" | "medium" | "low";
}

function affectedOf(cve: NonNullable<NvdVulnerability["cve"]>) {
  const values = cve.configurations?.flatMap(config => config.nodes?.flatMap(node => node.cpeMatch?.map(match => match.criteria).filter(Boolean) ?? []) ?? []) ?? [];
  return values.slice(0, 4).join(", ") || "See NVD configuration details";
}

export async function syncRecentNvd() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const startedAt = new Date();
  const run = await db.insert(nvdSyncRuns).values({ status: "running", startedAt });
  const runId = Number(run[0]?.insertId ?? 0);
  await db.insert(nvdSyncSettings).values({ id: 1, lastStatus: "running", lastStartedAt: startedAt }).onDuplicateKeyUpdate({ set: { lastStatus: "running", lastStartedAt: startedAt } });
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
    const url = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
    url.searchParams.set("pubStartDate", start.toISOString());
    url.searchParams.set("pubEndDate", end.toISOString());
    url.searchParams.set("resultsPerPage", "2000");
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`NVD returned ${response.status}`);
    const payload = (await response.json()) as { vulnerabilities?: NvdVulnerability[] };
    let imported = 0;
    for (const item of payload.vulnerabilities ?? []) {
      const cve = item.cve;
      if (!cve?.id || !cve.published) continue;
      const description = cve.descriptions?.find(item => item.lang === "en")?.value ?? cve.descriptions?.[0]?.value ?? "No description provided by NVD.";
      const metric = cve.metrics?.cvssMetricV40?.[0] ?? cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0];
      const score = metric?.cvssData?.baseScore ?? 0;
      const severity = severityOf(cve);
      await db.insert(cves).values({ cveNumber: cve.id, title: cve.id, description, severity, cvss: String(score), publishedDate: cve.published, affected: affectedOf(cve), sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}` }).onDuplicateKeyUpdate({ set: { description, severity, cvss: String(score), publishedDate: cve.published, affected: affectedOf(cve), sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}` } });
      imported += 1;
    }
    const completedAt = new Date();
    if (runId) await db.update(nvdSyncRuns).set({ status: "success", completedAt, importedCount: imported }).where(eq(nvdSyncRuns.id, runId));
    await db.update(nvdSyncSettings).set({ lastStatus: "success", lastCompletedAt: completedAt, lastImported: imported }).where(eq(nvdSyncSettings.id, 1));
    return { imported, completedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown NVD sync error";
    if (runId) await db.update(nvdSyncRuns).set({ status: "failed", completedAt: new Date(), errorMessage: message }).where(eq(nvdSyncRuns.id, runId));
    await db.update(nvdSyncSettings).set({ lastStatus: "failed" }).where(eq(nvdSyncSettings.id, 1));
    throw error;
  }
}

export async function handleNvdSync(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const settings = (await db.select().from(nvdSyncSettings).where(and(eq(nvdSyncSettings.id, 1), eq(nvdSyncSettings.scheduleCronTaskUid, user.taskUid))).limit(1))[0];
    if (!settings) return res.json({ ok: true, skipped: "orphan" });
    const result = await syncRecentNvd();
    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown NVD handler error";
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
}
