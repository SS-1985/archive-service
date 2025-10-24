import crypto from "node:crypto";
export function normalizeFmp(pr:any){
  const url = pr?.url ?? null;
  const title = (pr?.title ?? "").trim();
  const body = (pr?.text ?? "").trim();
  const tickers = pr?.symbol ? [String(pr.symbol).toUpperCase()] : [];
  const hash = crypto.createHash("sha256").update(`${title}${body}${url ?? ""}`).digest("hex");
  return {
    origin:"fmp", type:"press_release",
    externalId: url ?? `${title}:${pr?.site ?? ""}`,
    source: pr?.site ?? null,
    symbols: tickers,
    publishedAt: new Date(pr?.publishedDate ?? Date.now()).toISOString(),
    title, summary: null, body,
    url, imageUrl: pr?.image ?? null, categories: null,
    contentHash: hash
  };
}
