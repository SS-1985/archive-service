// --- VISIBILITY ENDPOINTS ---
// A) See if env vars are actually present on THIS service
app.get("/debug/env", (_req, res) => {
  res.json({
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    has_FMP_API_KEY: !!process.env.FMP_API_KEY,
    has_POLYGON_API_KEY: !!process.env.POLYGON_API_KEY,
    NODE_ENV: process.env.NODE_ENV ?? null
  });
});

// B) Call FMP from THIS service to prove the key is used and reachable
app.get("/debug/fmp-ping", async (_req, res) => {
  try {
    const params = new URLSearchParams({
      page: "0", size: "1", apikey: process.env.FMP_API_KEY || ""
    });
    const url = `https://financialmodelingprep.com/api/v3/press-releases?${params}`;
    const r = await fetch(url);
    const text = await r.text();
    res.status(r.status).json({
      status: r.status,
      ok: r.ok,
      usedKeyPrefix: process.env.FMP_API_KEY ? process.env.FMP_API_KEY.slice(0,4) + "…" : null,
      sample: (() => { try { return JSON.parse(text)?.[0] ?? null; } catch { return text.slice(0,150); } })()
    });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

// C) DB quick stats (counts + earliest/latest by origin/type)
app.get("/debug/db-stats", async (_req, res) => {
  try{
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
  }catch(e:any){
    res.status(500).json({ error: e?.message || String(e) });
  }
});
// --- /VISIBILITY ENDPOINTS ---
