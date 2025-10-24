// src/archive-backfill.ts
import { upsertArchive, pool } from "./db.js";
import { normalizePolygon } from "./normalize/polygon.js";
import { normalizeFmp } from "./normalize/fmp.js";
import { fetch } from "undici";

const DAYS = Number(process.env.BACKFILL_DAYS ?? 180);
const PAGE = Number(process.env.PAGE_SIZE ?? 50);
const ONLY = (process.env.ONLY ?? "").toLowerCase(); // "polygon" | "fmp" | ""

const SINCE_ISO = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Polygon backfill:
 * - pages newest -> oldest with cursor
 * - stops as soon as an item is older than SINCE_ISO
 */
async function backfillPolygon() {
  let cursor: string | undefined;
  let totalFetched = 0;
  let totalInserted = 0;
  let lastTs = "";

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE),
      order: "desc",
      published_utc_gte: SINCE_ISO,
      apiKey: process.env.POLYGON_API_KEY!,
    });
    if (cursor) params.set("cursor", cursor);

    const url = `https://api.polygon.io/v2/reference/news?${params}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Polygon ${r.status}`);
    const data: any = await r.json();

    const batch = data?.results ?? [];
    if (!batch.length) {
      console.log(`[backfill:polygon] no more results; stopping.`);
      break;
    }

    let crossedBoundary = false;
    for (const raw of batch) {
      const item = normalizePolygon(raw);
      lastTs = item.publishedAt;
      // hard stop if we cross older than the lower bound
      if (new Date(item.publishedAt) < new Date(SINCE_ISO)) {
        crossedBoundary = true;
        break;
      }
      try {
        const { rowCount } = await pool.query(
          `
            insert into archive_items
              (origin,type,external_id,source,symbol,published_at,title,summary,body,url,image_url,categories,content_hash)
            values
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            on conflict (origin,type,external_id) do nothing
          `,
          [
            "polygon",
            "news",
            item.externalId,
            item.source ?? null,
            item.symbols,
            item.publishedAt,
            item.title,
            item.summary ?? null,
            item.body ?? null,
            item.url ?? null,
            item.imageUrl ?? null,
            item.categories ?? null,
            item.contentHash,
          ]
        );
        if (rowCount === 1) totalInserted++;
      } catch {
        // ignore transient insert issues; idempotency via constraints
      }
    }

    totalFetched += batch.length;
    console.log(
      `[backfill:polygon] fetched=${batch.length} totalFetched=${totalFetched} insertedSoFar=${totalInserted} last=${lastTs}`
    );

    if (crossedBoundary) {
      console.log(
        `[backfill:polygon] crossed SINCE_ISO (${SINCE_ISO}); stopping.`
      );
      break;
    }

    const next = data?.next_url && new URL(data.next_url).searchParams.get("cursor");
    if (!next) {
      console.log(`[backfill:polygon] no next cursor; done.`);
      break;
    }
    cursor = next;

    // small courtesy pause to be nice to the API
    await sleep(150);
  }

  console.log(
    `[backfill:polygon] COMPLETE fetched=${totalFetched} inserted=${totalInserted} since=${SINCE_ISO}`
  );
}

/**
 * FMP backfill:
 * - iterate in 3-day windows from now back to SINCE_ISO
 * - upsert each item
 */
async function backfillFmp() {
  const start = new Date(SINCE_ISO);
  const end = new Date();

  let windows = 0;
  let totalInserted = 0;

  for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 3)) {
    const to = new Date(d);
    const from = new Date(d);
    from.setDate(d.getDate() - 2);

    // Clamp "from" to the SINCE_ISO boundary
    if (from < start) from.setTime(start.getTime());

    const params = new URLSearchParams({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      apikey: process.env.FMP_API_KEY!,
    });

    const url = `https://financialmodelingprep.com/api/v3/press-releases?${params}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.log(`[backfill:fmp] ${r.status} for window ${params.get("from")}..${params.get("to")}; continuing`);
      continue;
    }

    const arr: any[] = (await r.json()) ?? [];
    let insertedThisWindow = 0;

    for (const raw of arr) {
      const item = normalizeFmp(raw);
      try {
        const { rowCount } = await pool.query(
          `
            insert into archive_items
              (origin,type,external_id,source,symbol,published_at,title,summary,body,url,image_url,categories,content_hash)
            values
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            on conflict (origin,type,external_id) do nothing
          `,
          [
            "fmp",
            "press_release",
            item.externalId,
            item.source ?? null,
            item.symbols,
            item.publishedAt,
            item.title,
            item.summary ?? null,
            item.body ?? null,
            item.url ?? null,
            item.imageUrl ?? null,
            item.categories ?? null,
            item.contentHash,
          ]
        );
        if (rowCount === 1) {
          insertedThisWindow++;
          totalInserted++;
        }
      } catch {
        // ignore transient insert issues
      }
    }

    windows++;
    console.log(
      `[backfill:fmp] window ${params.get("from")}..${params.get("to")} size=${arr.length} inserted=${insertedThisWindow} totalInserted=${totalInserted}`
    );

    // small pause between windows
    await sleep(150);

    // Stop once we've reached the boundary window
    if (from.getTime() === start.getTime()) {
      console.log(`[backfill:fmp] reached SINCE_ISO (${SINCE_ISO}); stopping.`);
      break;
    }
  }

  console.log(
    `[backfill:fmp] COMPLETE windows=${windows} inserted=${totalInserted} since=${SINCE_ISO}`
  );
}

// ---- Main
(async () => {
  try {
    if (!ONLY || ONLY === "polygon") await backfillPolygon();
    if (!ONLY || ONLY === "fmp") await backfillFmp();
  } catch (e: any) {
    console.error("[backfill] error:", e?.message || e);
  } finally {
    await pool.end();
  }
})();
