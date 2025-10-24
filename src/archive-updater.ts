import { upsertArchive, pool } from "./db.js";
import { normalizePolygon } from "./normalize/polygon.js";
import { normalizeFmp } from "./normalize/fmp.js";
import { fetch } from "undici";

const N = 100;

async function pullPolygonLatest() {
  const params = new URLSearchParams({ limit: String(N), order: "desc", apiKey: process.env.POLYGON_API_KEY! });
  const r = await fetch(`https://api.polygon.io/v2/reference/news?${params}`);
  if (!r.ok) throw new Error(`Polygon ${r.status}`);
  const data: any = await r.json();
  let inserted = 0;
  let lastTs = "";
  for (const raw of data?.results ?? []) {
    const item = normalizePolygon(raw);
    lastTs = item.publishedAt;
    try { await upsertArchive(item); inserted++; } catch { /* conflict or minor issue; ignore */ }
  }
  console.log(`[updater] polygon fetched=${data?.results?.length ?? 0} attempted=${inserted} last=${lastTs}`);
}

async function pullFmpLatest() {
  const params = new URLSearchParams({ limit: String(N), apikey: process.env.FMP_API_KEY! });
  const r = await fetch(`https://financialmodelingprep.com/api/v3/press-releases?${params}`);
  if (!r.ok) throw new Error(`FMP ${r.status}`);
  const arr: any[] = await r.json();
  let inserted = 0;
  let lastTs = "";
  for (const raw of arr ?? []) {
    const item = normalizeFmp(raw);
    lastTs = item.publishedAt;
    try { await upsertArchive(item); inserted++; } catch { /* conflict or minor issue; ignore */ }
  }
  console.log(`[updater] fmp fetched=${arr?.length ?? 0} attempted=${inserted} last=${lastTs}`);
}

(async () => {
  try {
    await Promise.all([pullPolygonLatest(), pullFmpLatest()]);
    console.log("[updater] cycle done");
  } catch (e: any) {
    console.error("[updater] error", e?.message || e);
  } finally {
    await pool.end();
  }
})();
