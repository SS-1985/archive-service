// src/db.ts
import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function upsertArchive(i: any) {
  await pool.query(
    `
    insert into archive_items
    (origin,type,external_id,source,symbol,published_at,title,summary,body,url,image_url,categories,content_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (origin,type,external_id) do nothing
  `,
    [
      i.origin,
      i.type,
      i.externalId,
      i.source ?? null,
      i.symbols,
      i.publishedAt,
      i.title,
      i.summary ?? null,
      i.body ?? null,
      i.url ?? null,
      i.imageUrl ?? null,
      i.categories ?? null,
      i.contentHash,
    ]
  );
}
