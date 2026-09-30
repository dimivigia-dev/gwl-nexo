/* Fashion retrieval uses public catalog data; style matching is an inference, not a trend or quality certification. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Item = Record<string, any>;
export const normalizeFashion = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const groups = [
  ["camisa", /\bcamisas?\b/, /\b(camisas?|polo)\b/],
  ["camiseta", /\bcamisetas?\b/, /\bcamisetas?\b/],
  ["calca", /\bcalcas?\b/, /\bcalcas?\b/],
  ["vestido", /\bvestidos?\b/, /\bvestidos?\b/],
  ["blusa", /\bblusas?\b/, /\bblusas?\b/],
  ["saia", /\bsaias?\b/, /\bsaias?\b/],
  ["bermuda", /\b(bermudas?|shorts?)\b/, /\b(bermudas?|shorts?)\b/],
  ["polo", /\bpolos?\b/, /\bpolos?\b/],
  ["blazer", /\bblazers?\b/, /\bblazers?\b/],
  ["moletom", /\bmoletom\b/, /\bmoletom\b/],
  ["jaqueta", /\bjaquetas?\b/, /\bjaquetas?\b/],
  ["tenis", /\btenis\b/, /\btenis\b/],
  ["sapato", /\bsapatos?\b/, /\b(sapatos?|mocassim|loafer)\b/],
  ["sandalia", /\bsandalias?\b/, /\bsandalias?\b/],
  ["biquini", /\bbiquinis?\b/, /\bbiquinis?\b/],
  ["casaco", /\bcasacos?\b/, /\bcasacos?\b/],
  ["regata", /\bregatas?\b/, /\bregatas?\b/],
  ["sueter", /\b(sueter|cardigan)\b/, /\b(sueter|cardigan)\b/],
  ["pijama", /\bpijamas?\b/, /\bpijamas?\b/],
  ["legging", /\bleggings?\b/, /\bleggings?\b/],
  ["macacao", /\bmacacao\b/, /\bmacacao\b/],
  ["conjunto", /\bconjuntos?\b/, /\bconjuntos?\b/],
] as const;
const styles = [
  { name: "Old money", query: /old[ -]?money|quiet luxury/, match: /old[ -]?money|linho|alfaiataria|trico|oxford|polo|mocassim/, reject: /gamer|esport|futebol|jersey|uniforme|patrocin|estampad|neon|fluorescente/ },
  { name: "Streetwear", query: /streetwear/, match: /streetwear|oversized|cargo|wide leg|baggy|boxy/, reject: /social slim/ },
  { name: "Oversized", query: /oversized|over size/, match: /oversized|over size|ampl[ao]|boxy/, reject: /slim fit|just[ao]/ },
  { name: "Alfaiataria", query: /alfaiataria/, match: /alfaiataria/, reject: /gamer|jersey|uniforme/ },
  { name: "Minimalista", query: /minimalista/, match: /minimalista|lis[ao]|basica|basico/, reject: /estampad|neon|gamer|jersey/ },
];
export function fashionIntent(query: string) {
  const q = normalizeFashion(query);
  const group = groups.find(([, test]) => test.test(q));
  const style = styles.find(s => s.query.test(q));
  const fashion = Boolean(group || style || /\b(roupas?|moda|look|casaco|sueter|cardigan|regata|macacao|lingerie|cueca|calcinha|pijama|fitness|legging)\b/.test(q));
  const gender = /\b(feminin[ao]|mulher)\b/.test(q) ? "feminino" : /\b(masculin[ao]|homem)\b/.test(q) ? "masculino" : "";
  const base = group?.[0] || (/\b(roupas?|moda|look)\b/.test(q) || style ? "roupa" : q);
  const raw = q.replace(/old[ -]?money|quiet luxury|streetwear|minimalista|\b(bonit[ao]s?|melhores?|na moda|da moda|roupas?|moda|look|quero|comprar|barat[ao]s?|de|do|da|e|para|com|um|uma)\b/g, " ").replace(/\s+/g, " ").trim();
  let queries = [raw || "roupa"];
  if (style?.name === "Old money") {
    const alternatives = base === "calca" || base === "bermuda" ? ["alfaiataria", "sarja"] : base === "sapato" ? ["mocassim", "loafer"] : ["linho", "trico"];
    queries = alternatives.map(term => [base === "roupa" ? "camisa" : base, gender, term].filter(Boolean).join(" "));
  } else if (style?.name === "Streetwear") queries = [[base === "roupa" ? "camiseta" : base, gender, base === "calca" ? "cargo" : "oversized"].filter(Boolean).join(" "), raw];
  const constrained = style && style.name !== "Old money" ? raw.replace(style.query, "").trim() : raw;
  if (queries.length === 1 && gender) queries.push(queries[0].replace(/\b(masculin[ao]|feminin[ao]|homem|mulher)\b/g, "").replace(/\s+/g, " ").trim());
  const constraints = constrained.split(/\s+/).filter(t => t.length > 1 && !/^(masculin[ao]|feminin[ao]|homem|mulher)$/.test(t) && t !== group?.[0] && t !== group?.[0] + "s");
  return { fashion, style, group, gender, queries: [...new Set(queries)].slice(0, 2), constraints: style?.name === "Old money" ? constraints.filter(t => !["old", "money", "quiet", "luxury"].includes(t)) : constraints };
}
function safeUrl(value: unknown, host?: string) {
  try { const u = new URL(String(value)); return u.protocol === "https:" && (!host || u.hostname === host) ? u.toString() : ""; } catch { return ""; }
}
export function parseFashionCatalog(data: unknown, store: { name: string; host: string }): Item[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 24).flatMap((p: Item) => {
    const variants: Item[] = [];
    for (const sku of p.items || []) for (const seller of sku.sellers || []) {
      const offer = seller.commertialOffer || {};
      if (!(Number(offer.Price) > 0) || !(Number(offer.AvailableQuantity) > 0) || offer.IsAvailable === false) continue;
      if (offer.PriceValidUntil && Date.parse(offer.PriceValidUntil) < Date.now()) continue;
      variants.push({ sku, seller, offer });
    }
    variants.sort((a,b) => Number(a.offer.Price) - Number(b.offer.Price));
    const best = variants[0]; if (!best) return [];
    const link = safeUrl(p.link, store.host);
    const image = safeUrl(best.sku.images?.[0]?.imageUrl);
    if (!link || !image || !p.productName) return [];
    const spec = (keys: string[]) => keys.flatMap(key => p[key] || []).map(String).join(", ");
    const sizes = [...new Set(variants.flatMap(v => v.sku.Tamanho || []).map(String))];
    const composition = spec(["COMPOSIÇÃO", "Composição", "Material"]);
    const gender = spec(["Gênero", "GÊNERO"]);
    const color = spec(["Cor", "COR"]);
    return [{
      id: store.name + "-" + p.productId, title: String(p.productName), link, image, store: store.name,
      price: Number(best.offer.Price), originalPrice: Number(best.offer.ListPrice || 0), currency: "BRL", condition: "Novo",
      brand: String(p.brand || ""), composition, gender, color, sizes, priceSize: (best.sku.Tamanho || []).join(", "),
      description: String(p.description || "").replace(/<[^>]*>/g, " ").slice(0, 3000),
      rating: 0, reviewCount: 0, sellerStatus: String(best.seller.sellerName || ""), officialStore: best.seller.sellerId === "1",
      category: (p.categories || []).join(" "), pattern: spec(["Estampa"]), releaseDate: p.releaseDate || "",
    }];
  });
}
export function rankFashionProducts(products: Item[], query: string): Item[] {
  const intent = fashionIntent(query);
  const unique = new Map<string, Item>();
  for (const item of products) {
    if (!Number.isFinite(item.price) || item.price <= 0 || !safeUrl(item.link) || !safeUrl(item.image)) continue;
    const title = normalizeFashion(item.title);
    const facts = normalizeFashion([item.title, item.composition, item.color, item.pattern, item.gender].join(" "));
    if (intent.group && !intent.group[2].test(title)) continue;
    if (intent.gender && !facts.includes(intent.gender)) continue;
    if (intent.gender && !/infantil|crianca|menino|menina|bebe/.test(normalizeFashion(query)) && /infantil|bebe|menino|menina/.test(title)) continue;
    if (intent.style && (!intent.style.match.test(facts) || intent.style.reject.test(facts))) continue;
    // Explicit attributes still apply after style expansion (e.g. black, linen, long sleeve).
    if (!intent.constraints.every(term => facts.includes(term))) continue;
    const key = item.store + ":" + item.id;
    const prev = unique.get(key);
    if (!prev || item.price < prev.price) unique.set(key, item);
  }
  const valid = [...unique.values()];
  const min = Math.min(...valid.map(x => x.price), Infinity);
  return valid.map((item): Item => {
    const facts = normalizeFashion([item.title, item.composition, item.pattern, item.color].join(" "));
    const reasons: string[] = [];
    if (intent.style) reasons.push("Características compatíveis com " + intent.style.name);
    if (item.composition) reasons.push("Composição informada pela loja");
    if (item.officialStore) reasons.push("Vendido pela própria loja");
    const neutral = /off white|bege|branco|preto|marinho|creme|cinza|kaki|caqui|marrom/.test(facts);
    const stylePoints = intent.style ? 40 + (intent.style.name === "Old money" && neutral ? 8 : 0) : 40;
    // No invented seller ratings or trend statistics: assess match and documented attributes.
    const score = Math.round(stylePoints + (item.composition ? 12 : 0) + (item.officialStore ? 12 : 0) + Math.min(8,item.sizes.length*2) + (item.rating > 0 ? Math.min(10,item.rating*2) : 0) + 10*min/item.price);
    return {...item, score, reasons, savingsPercent: item.originalPrice > item.price ? Math.round((1-item.price/item.originalPrice)*100) : 0,
      badge: intent.style ? "Combina com " + intent.style.name : "Seleção de moda"};
  }).sort((a,b) => b.score-a.score || a.price-b.price).slice(0,48);
}
export async function searchFashion(query: string, page = 0) {
  const intent = fashionIntent(query);
  const stores = [{ name: "C&A", host: "www.cea.com.br" }, { name: "Hering", host: "www.hering.com.br" }, {name:"Reserva",host:"www.usereserva.com"}];
  const batches: {name: string; status: string; items: Item[]}[] = [];
  // At most two simultaneous catalogs, with no auth or customer information sent to retailers.
  await Promise.all(intent.queries.map(async term => {
    const group = await Promise.all(stores.map(async store => {
      try {
        const response = await fetch("https://" + store.host + "/api/catalog_system/pub/products/search?ft=" + encodeURIComponent(term) + `&_from=${page*24}&_to=${page*24+23}`, {
          headers: { accept: "application/json" }, signal: AbortSignal.timeout(18000),
        });
        if (!response.ok) return { name: store.name, status: "Catálogo indisponível", items: [] };
        const items = parseFashionCatalog(await response.json(), store);
        return { name: store.name, status: items.length ? "consultada" : "Sem estoque para esta busca", items };
      } catch { return { name: store.name, status: "Catálogo indisponível", items: [] }; }
    }));
    batches.push(...group);
  }));
  const raw = batches.flatMap(x=>x.items);
  const results = rankFashionProducts(raw,query);
  return {
    results, page, hasMore:page<9 && batches.some(b=>b.items.length>=20), mode: "fashion", style: intent.style?.name || "", queries: intent.queries,
    inspectedCount: new Set(raw.map(x=>x.id)).size,
    sources: stores.map(store=>({name:store.name,found:results.filter(x=>x.store===store.name).length,
      status: results.some(x=>x.store===store.name) ? "consultada" : batches.some(b=>b.name===store.name && b.status==="consultada") ? "Sem peças compatíveis" : batches.find(b=>b.name===store.name)?.status})),
    retailers: stores.map(s=>({name:s.name,found:results.filter(x=>x.store===s.name).length})).filter(s=>s.found),
    criteria: ["Estilo solicitado", "Tipo de peça", "Composição informada", "Origem da oferta", "Estoque por tamanho", "Preço"],
    updatedAt: new Date().toISOString(),
  };
}
