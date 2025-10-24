import { upsertArchive, pool } from "./db.js";
import { normalizePolygon } from "./normalize/polygon.js";
import { normalizeFmp } from "./normalize/fmp.js";
import { fetch } from "undici";

const DAYS = Number(process.env.BACKFILL_DAYS ?? 180);
const PAGE = Number(process.env.PAGE_SIZE ?? 50);
const sinceISO = new Date(Date.now() - DAYS*24*3600*1000).toISOString();

async function backfillPolygon(){
  let cursor: string | undefined;
  while (true){
    const params = new URLSearchParams({
      limit: String(PAGE), order:"desc",
      published_utc_gte: sinceISO,
      apiKey: process.env.POLYGON_API_KEY!
    });
    if (cursor) params.set("cursor", cursor);
    const r = await fetch(`https://api.polygon.io/v2/reference/news?${params}`);
    if (!r.ok) break;
    const data:any = await r.json();
    for (const raw of data?.results ?? []) await upsertArchive(normalizePolygon(raw));
    const next = data?.next_url && new URL(data.next_url).searchParams.get("cursor");
    if (!next) break; cursor = next!;
  }
}

async function backfillFmp(){
  const start = new Date(sinceISO);
  const end = new Date();
  for (let d = new Date(end); d >= start; d.setDate(d.getDate()-3)){
    const from = new Date(d); from.setDate(d.getDate()-2);
    const params = new URLSearchParams({
      from: from.toISOString().slice(0,10),
      to: d.toISOString().slice(0,10),
      apikey: process.env.FMP_API_KEY!
    });
    const r = await fetch(`https://financialmodelingprep.com/api/v3/press-releases?${params}`);
    if (!r.ok) continue;
    const arr:any[] = await r.json();
    for (const raw of arr ?? []) await upsertArchive(normalizeFmp(raw));
  }
}

(async()=>{ try{ await backfillPolygon(); await backfillFmp(); } finally{ await pool.end(); }})();
