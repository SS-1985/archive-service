// src/api.ts
import express from "express";
import cors from "cors";
import { pool } from "./db.js";

// 1) create app FIRST
const app = express();

// 2) CORS (allow all if unset; otherwise comma list)
const allow = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : "*";
app.use(cors({ origin: allow as any }));

// 3) HEALTH (must not depend on DB)
app.get("/healthz", (_req, res) => res.send("ok"));

// 4) DEBUG: env presence (never prints secrets)
app.get("/debug/env", (_req, res) => {
  res.json({
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    has_FMP_API_KEY: !!process.env.FMP_API_KEY,
    has_POLYGON_API_KEY: !!process.env.POLYGON_API_KEY,
    NODE_ENV: process.env.NODE_ENV ?? null
  });
});

// 5) DEBUG: ping FMP from THIS service (Node 22 has global fetch)
app.get("/debug/fmp-ping", async (_req, res) => {
  try {
    const params = new URLSearchParams({
      page: "0",
      size: "1",
      apikey: process.env.FMP_API_KEY || ""
    });
    const url = `https://financialmodelingprep.com/api/v3/press-releases?${params}`;
    const r = await fetch(url);
    const text = await r.text();
    let sample: any = null;
    try { sample = JSON.parse(text)?.[0] ?? null; } catch { sample = text.slice(0, 200); }
    res.status(r.status).json({
      status: r.status,
      ok: r.ok,
      usedKeyPrefix: process.env.FMP_API_KEY ? process.env.FMP_API_KEY.slice(0,4) + "…" : null,
      sample
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// 6) DEBUG: quick DB stats
app.get("/debug/db-stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select origin, type,
             count(*)::int as total,
             min(published_at) as earliest,
             max(published_at) as latest
      from archive_items
      group by 1,2
      order by 1,2
    `);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// 7) (optional) your existing /api/archive route can go here

// 8) start server
app.listen(process.env.PORT || 3000, () => {
  console.log("Archive API ready on", process.env.PORT || 3000);
});
