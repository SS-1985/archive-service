async function backfillFmp() {
  const SINCE = new Date(SINCE_ISO).getTime();
  const SIZE = PAGE; // reuse PAGE env (default 50)
  let page = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  let done = false;

  while (!done) {
    const params = new URLSearchParams({
      page: String(page),
      size: String(SIZE),
      apikey: process.env.FMP_API_KEY!,
    });

    const url = `https://financialmodelingprep.com/api/v3/press-releases?${params}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.log(`[backfill:fmp] ${r.status} on page=${page}; retrying next page`);
      page++;
      continue;
    }

    const arr: any[] = (await r.json()) ?? [];
    if (!arr.length) {
      console.log(`[backfill:fmp] no results at page=${page}; stopping.`);
      break;
    }

    let insertedThisPage = 0;
    for (const raw of arr) {
      const item = normalizeFmp(raw);
      const ts = new Date(item.publishedAt).getTime();

      // stop once we cross older than the boundary
      if (ts < SINCE) { done = true; break; }

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
        if (rowCount === 1) insertedThisPage++, totalInserted++;
      } catch { /* ignore, idempotent */ }
    }

    totalFetched += arr.length;
    console.log(`[backfill:fmp] page=${page} size=${arr.length} inserted=${insertedThisPage} totalInserted=${totalInserted}`);

    if (done) {
      console.log(`[backfill:fmp] reached SINCE_ISO (${SINCE_ISO}); stopping.`);
      break;
    }

    if (arr.length < SIZE) {
      console.log(`[backfill:fmp] last page (${page}) smaller than size; done.`);
      break;
    }

    page++;
    await sleep(150);
  }

  console.log(`[backfill:fmp] COMPLETE fetched=${totalFetched} inserted=${totalInserted} since=${SINCE_ISO}`);
}
