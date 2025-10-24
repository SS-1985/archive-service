// src/normalize/fmp.ts
import crypto from "node:crypto";

export function normalizeFmp(raw: any) {
  // FMP typical fields: symbol, date, title, text, url, (sometimes) image / site
  const symbol = raw.symbol?.toUpperCase() ?? null;
  const publishedAt = raw.date ? new Date(raw.date).toISOString() : null;

  const title = (raw.title ?? "").trim();
  const url = raw.url ?? null;
  const source = raw.site ?? raw.source ?? null;  // not always present
  const body = raw.text ?? null;
  const summary = body ? String(body).slice(0, 500) : null;
  const imageUrl = raw.image ?? null;

  // Build a stable key from multiple fields (order matters)
  const key = [
    symbol ?? "",
    publishedAt ?? "",
    title,
    url ?? ""
  ].join("|");

  // Unique, deterministic external_id for conflict prevention
  const externalId = crypto.createHash("sha1").update(key).digest("hex");

  return {
    origin: "fmp",
    type: "press_release",
    externalId,
    source,
    symbols: symbol ? [symbol] : [],
    publishedAt,
    title,
    summary,
    body,
    url,
    imageUrl,
    categories: null,
    contentHash: externalId, // fine to reuse
  };
}
