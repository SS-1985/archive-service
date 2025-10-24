import crypto from "node:crypto";
export function normalizePolygon(p:any){
  const symbols = Array.from(new Set((p?.tickers ?? []).map((t:string)=>t.toUpperCase())));
  const url = p?.article_url ?? p?.url ?? null;
  const title = (p?.title ?? "").trim();
  const body = (p?.description ?? "").trim();
  const hash = crypto.createHash("sha256").update(`${title}${body}${url ?? ""}`).digest("hex");
  return {
    origin:"polygon", type:"news",
    externalId: String(p?.id ?? url ?? `${title}:${p?.publisher?.name ?? ""}`),
    source: p?.publisher?.name ?? null,
    symbols,
    publishedAt: new Date(p?.published_utc ?? Date.now()).toISOString(),
    title, summary: p?.description ?? null, body: null,
    url, imageUrl: p?.image_url ?? null, categories: null,
    contentHash: hash
  };
}
