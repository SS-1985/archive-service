import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
app.use(cors({ origin: (process.env.CORS_ORIGIN?.split(",") ?? "*") as any }));

app.get("/api/archive", async (req, res) => {
  const { q, symbol, type, origin, from, to, hasImage, limit="20", cursor } = req.query as any;
  const lim = Math.min(Math.max(parseInt(limit,10)||20,1),100);
  const where:string[]=[]; const vals:any[]=[]; let i=1;

  if (origin && origin!=="both"){ where.push(`origin = $${i++}`); vals.push(origin); }
  if (type && type!=="both"){ where.push(`type = $${i++}`); vals.push(type); }
  if (from){ where.push(`published_at >= $${i++}`); vals.push(new Date(from)); }
  if (to){ where.push(`published_at <= $${i++}`); vals.push(new Date(to)); }
  if (hasImage==="true"){ where.push(`image_url is not null and image_url <> ''`); }
  if (symbol){
    const syms = String(symbol).split(",").map((s)=>s.trim().toUpperCase()).filter(Boolean);
    if (syms.length){ where.push(`symbol && $${i++}`); vals.push(syms); }
  }
  if (q){ where.push(`to_tsvector('english', coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(body,'')) @@ plainto_tsquery($${i++})`); vals.push(q); }

  if (cursor){
    const { publishedAt, id } = JSON.parse(Buffer.from(String(cursor), "base64").toString());
    where.push(`(published_at, id) < ($${i++}, $${i++})`); vals.push(new Date(publishedAt), id);
  }

  const sql = `
    select id, origin, type, source, symbol, published_at, title, summary, url, image_url
    from archive_items
    ${where.length ? "where "+where.join(" and ") : ""}
    order by published_at desc, id desc
    limit ${lim+1}`;
  const { rows } = await pool.query(sql, vals);
  const hasMore = rows.length > lim;
  const items = rows.slice(0,lim).map(r=>({
    id:r.id, origin:r.origin, type:r.type, source:r.source, symbol:r.symbol,
    publishedAt:r.published_at, title:r.title, summary:r.summary, url:r.url, imageUrl:r.image_url
  }));
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ publishedAt: rows[lim].published_at, id: rows[lim].id })).toString("base64")
    : null;
  res.json({ items, nextCursor });
});

app.get("/healthz", (_req,res)=>res.send("ok"));
app.listen(process.env.PORT || 3000, ()=>console.log("Archive API ready"));
