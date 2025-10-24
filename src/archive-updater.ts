import { upsertArchive, pool } from "./db.js";
import { normalizePolygon } from "./normalize/polygon.js";
import { normalizeFmp } from "./normalize/fmp.js";
import { fetch } from "undici";

const N = 100;

async function pullPolygonLatest(){
  const params = new URLSearchParams({ limit:String(N), order:"desc", apiKey: process.env.POLYGON_API_KEY! });
  const r = await fetch(`https://api.polygon.io/v2/reference/news?${params}`);
  const data:any = await r.json();
  for (const raw of data?.results ?? []) await upsertArchive(normalizePolygon(raw));
}
async function pullFmpLatest(){
  const params = new URLSearchParams({ limit:String(N), apikey: process.env.FMP_API_KEY! });
  const r = await fetch(`https://financialmodelingprep.com/api/v3/press-releases?${params}`);
  const arr:any[] = await r.json();
  for (const raw of arr ?? []) await upsertArchive(normalizeFmp(raw));
}

(async()=>{ try{ await Promise.all([pullPolygonLatest(), pullFmpLatest()]); } finally{ await pool.end(); }})();
