import { plannerRole, visibleTasks, taskAction } from "../../planner-tasks";
import { fashionIntent, searchFashion, parseFashionCatalog } from "../../fashion-search";
import { credentialIdentity, type PontoDatabase } from "../../ponto-auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Bucket = {
  put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
  get: (key: string) => Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete: (key: string) => Promise<void>;
};

async function resources(): Promise<{ db: PontoDatabase; bucket: Bucket }> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB || !env.BUCKET) throw new Error("Os serviços do GWL Planner estão indisponíveis.");
  return { db: env.DB as unknown as PontoDatabase, bucket: env.BUCKET as unknown as Bucket };
}

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });
const text = (value: unknown, size = 4000) => String(value || "").trim().slice(0, size);
const cleanEmail = (value: unknown) => text(value, 180).toLowerCase();
const messengerFileTypes = new Set([
  "application/pdf", "text/plain", "text/csv", "application/zip", "application/x-zip-compressed",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const messengerExtensions = new Set(["pdf", "txt", "csv", "zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

function allowedMessengerFile(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  return file.type.startsWith("image/") && file.type !== "image/svg+xml" || messengerFileTypes.has(file.type) || messengerExtensions.has(extension);
}

async function current(request: Request, db: PontoDatabase) {
  const identity = await credentialIdentity(request, db);
  if (!identity) return null;
  const profile = await db.prepare("SELECT id,email,name,role,planner_role,employee_id,site_id,status FROM ponto_access_profiles WHERE lower(email)=lower(?)")
    .bind(identity.email).first<Record<string, unknown>>();
  if (!profile || profile.status === "inactive") return null;
  return { email: identity.email.toLowerCase(), name: String(profile.name || identity.displayName || identity.email), profile: {...profile,planner_role:plannerRole(profile)} };
}

async function ensureGeneral(db: PontoDatabase) {
  await db.prepare("INSERT OR IGNORE INTO planner_threads (id,title,kind,created_by) VALUES ('general','Equipe GWL','general','system')").run();
}

function xml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

type NewsItem = { id: string; title: string; link: string; publishedAt: string; source: string; category: string; importance?: number; freshness?: string };
const TRUSTED_NEWS = ["Agência Brasil", "G1", "BBC", "CNN", "Reuters", "Associated Press", "AP News", "Deutsche Welle", "DW", "France 24", "Euronews", "ONU News", "Valor Econômico", "Estadão", "O Globo", "UOL", "Folha de S.Paulo", "Câmara dos Deputados", "O Popular", "Mais Goiás", "Agência Cora", "Governo de Goiás", "Prefeitura de Goiânia", "Jornal Opção", "TV Anhanguera", "A Redação"];
const IMPORTANT_NEWS = /urgente|alerta|emergência|emergencia|ataque|guerra|conflito|morte|mortes|desastre|enchente|incêndio|incendio|terremoto|furacão|acidente|crise|eleição|eleicao|presidente|governador|prefeito|congresso|supremo|stf|decisão|decisao|lei|economia|juros|inflação|inflacao|dólar|dolar|emprego|saúde|saude|vacina|epidemia|pandemia|segurança|seguranca|operação|operacao|prisão|prisao|goiânia|goiania|goiás|goias/i;
const HIGH_TRUST_NEWS = /reuters|associated press|ap news|bbc|agência brasil|agencia brasil|g1|onu news|deutsche welle|dw|france 24|euronews/i;

function tag(item: string, names: string[]) {
  for (const name of names) {
    const found = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (found?.[1]) return xml(found[1]);
  }
  return "";
}

function newsCategory(title: string) {
  const value = title.toLowerCase();
  if (/econom|mercado|emprego|infla|dólar|dolar|empresa|negócio/.test(value)) return "Economia";
  if (/tecnolog|inteligência artificial|software|digital|internet|celular/.test(value)) return "Tecnologia";
  if (/saúde|saude|vacina|hospital|doença/.test(value)) return "Saúde";
  if (/esporte|futebol|copa|campeonato|olimp/.test(value)) return "Esportes";
  if (/governo|congresso|senado|câmara|politic|eleiç/.test(value)) return "Brasil";
  return "Atualidade";
}

function parseFeed(source: string, defaultSource: string, fallbackLink: string, scope = "") {
  const blocks = [...source.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.slice(0, 20).map((match, index): NewsItem | null => {
    const item = match[1];
    let title = tag(item, ["title"]);
    let sourceName = tag(item, ["source"]) || defaultSource;
    if (defaultSource.startsWith("Google Notícias") && title.includes(" - ")) {
      const parts = title.split(" - ");
      const candidate = parts.pop()?.trim() || "";
      if (candidate) sourceName = candidate;
      title = parts.join(" - ").trim();
      if (!TRUSTED_NEWS.some((trusted) => sourceName.toLowerCase().includes(trusted.toLowerCase()))) return null;
    }
    const atomLink = item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    const link = tag(item, ["link", "guid"]) || atomLink || fallbackLink;
    const publishedAt = tag(item, ["pubDate", "published", "updated", "dc:date"]);
    if (!title || !/^https?:\/\//i.test(link)) return null;
    return { id: `${defaultSource}-${index}-${title.slice(0, 30)}`, title, link, publishedAt, source: sourceName, category: scope || newsCategory(title) };
  }).filter((item): item is NewsItem => Boolean(item));
}

function rankedNews(item: NewsItem, now: number): NewsItem | null {
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published)) return null;
  const ageHours = (now - published) / 3_600_000;
  if (ageHours < -1 || ageHours > 24) return null;
  const important = IMPORTANT_NEWS.test(item.title);
  if (ageHours > 30 && !important) return null;
  const freshnessPoints = Math.max(0, 48 - ageHours) * 1.35;
  const sourcePoints = HIGH_TRUST_NEWS.test(item.source) ? 14 : 8;
  const impactPoints = important ? 18 : 0;
  const localPoints = item.category === "Goiás" ? 12 : item.category === "Mundo" ? 8 : 3;
  const importance = Math.round(Math.min(100, freshnessPoints + sourcePoints + impactPoints + localPoints));
  const freshness = ageHours <= 1 ? "Agora" : ageHours <= 6 ? "Últimas horas" : ageHours <= 24 ? "Hoje" : `${Math.max(1, Math.round(ageHours))}h atrás`;
  return { ...item, publishedAt: new Date(published).toISOString(), importance, freshness };
}

async function latestNews() {
  const feeds = [
    { source: "G1 Goiás", url: "https://g1.globo.com/rss/g1/goias/", home: "https://g1.globo.com/go/goias/", scope: "Goiás" },
    { source: "Agência Cora", url: "https://agenciacoradenoticias.go.gov.br/feed/", home: "https://agenciacoradenoticias.go.gov.br/", scope: "Goiás" },
    { source: "Google Notícias — Goiânia", url: `https://news.google.com/rss/search?q=${encodeURIComponent("Goiânia OR Goiás when:1d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, home: "https://news.google.com/", scope: "Goiás" },
    { source: "BBC News Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", home: "https://www.bbc.com/portuguese", scope: "Mundo" },
    { source: "Google Notícias — Mundo", url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=pt-BR&gl=BR&ceid=BR:pt-419", home: "https://news.google.com/", scope: "Mundo" },
    { source: "Google Notícias — Internacional", url: `https://news.google.com/rss/search?q=${encodeURIComponent("mundo OR internacional when:1d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, home: "https://news.google.com/", scope: "Mundo" },
    { source: "Agência Brasil", url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", home: "https://agenciabrasil.ebc.com.br/", scope: "Brasil" },
  ];
  const responses = await Promise.allSettled(feeds.map(async (feed) => {
    const response = await fetch(feed.url, { headers: { "user-agent": "GWL-Nexo/2.0 (+news-reader)" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`feed ${feed.source} unavailable`);
    return parseFeed(await response.text(), feed.source, feed.home, feed.scope);
  }));
  const now = Date.now();
  const seen = new Set<string>();
  const clean = responses.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .map((item) => rankedNews(item, now))
    .filter((item): item is NewsItem & { importance: number; freshness: string } => Boolean(item))
    .filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç ]/gi, "").slice(0, 90);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.importance - a.importance || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const goias = clean.filter(item => item.category === "Goiás").slice(0, 8);
  const world = clean.filter(item => item.category === "Mundo").slice(0, 8);
  const brasil = clean.filter(item => item.category === "Brasil").slice(0, 4);
  return [...goias, ...world, ...brasil]
    .sort((a, b) => (b.importance || 0) - (a.importance || 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 20) as NewsItem[];
}

function absoluteUrl(value: unknown, base: string) {
  try { return new URL(String(value || ""), base).toString(); } catch { return ""; }
}

function jsonLdProducts(html: string, base: string, store: string) {
  const results: Array<Record<string, unknown>> = [];
  for (const match of html.slice(0, 3_000_000).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1].replace(/&quot;/g, '"'));
      const queue: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (queue.length && results.length < 30) {
        const node = queue.shift() as Record<string, unknown> | null;
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node.itemListElement)) queue.push(...node.itemListElement.map((entry: any) => entry.item || entry));
        if (Array.isArray(node["@graph"])) queue.push(...node["@graph"] as unknown[]);
        if (node["@type"] === "Product" || node.name && (node.offers || node.price)) {
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers as Record<string, unknown> | undefined;
          const price = Number(offers?.price || offers?.lowPrice || node.price || 0);
          const aggregate = node.aggregateRating as Record<string, unknown> | undefined;
          const rating = Number(aggregate?.ratingValue || 0);
          const reviewCount = Number(aggregate?.reviewCount || aggregate?.ratingCount || 0);
          const image = Array.isArray(node.image) ? node.image[0] : node.image;
          const link = absoluteUrl(node.url || offers?.url, base);
          if (node.name && link) results.push({ id: `${store}-${results.length}-${String(node.name).slice(0, 30)}`, title: node.name, price, currency: offers?.priceCurrency || "BRL", link, image: absoluteUrl(image, base), store, condition: "Novo", rating, reviewCount, sellerPositive: 0, soldQuantity: 0, freeShipping: false, relevance: Math.max(.5, 1 - results.length / 36) });
        }
      }
    } catch { /* Alguns sites publicam JSON-LD parcial; ignoramos somente o bloco inválido. */ }
  }
  return results;
}

function magaluProducts(html: string, base: string) {
  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const match = html.slice(0, 3_000_000).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return results;
  try {
    const root = JSON.parse(match[1]);
    const queue: unknown[] = [root];
    while (queue.length && results.length < 40) {
      const value = queue.shift();
      if (Array.isArray(value)) { queue.push(...value); continue; }
      if (!value || typeof value !== "object") continue;
      const node = value as Record<string, any>;
      if (node.type === "product" && node.title && node.path) {
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const fallbackOffer = Array.isArray(node.itemFallback?.offers) ? node.itemFallback.offers[0] : null;
        const selected = offer || fallbackOffer || {};
        const bestPrice = Number(selected.bestPrice?.totalAmount || selected.price || 0);
        const regularPrice = Number(selected.price || selected.listPrice || bestPrice || 0);
        const link = absoluteUrl(node.path, base);
        const key = `${node.id || link}`;
        if (link && !seen.has(key)) {
          seen.add(key);
          results.push({
            id: `magalu-${node.id || results.length}`,
            title: node.title,
            price: bestPrice || regularPrice,
            originalPrice: Number(selected.listPrice || regularPrice || 0),
            currency: selected.currency || "BRL",
            link,
            image: absoluteUrl(String(node.image || "").replace("{w}x{h}", "320x320"), base),
            store: "Magazine Luiza",
            condition: "Novo",
            rating: Number(node.reviewRating || 0),
            reviewCount: Number(node.reviewCount || 0),
            sellerPositive: 0,
            sellerStatus: node.tags?.includes?.("is_magalu_indica") ? "Magalu Indica" : "",
            soldQuantity: 0,
            freeShipping: Number(node.shippingTag?.cost) === 0,
            officialStore: false,
            relevance: Math.max(.55, 1 - results.length / 55),
          });
        }
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
  } catch { /* A busca continua com as demais fontes se o catálogo mudar de formato. */ }
  return results;
}

function kabumProducts(html: string, base: string) {
  const results: Array<Record<string, unknown>> = [];
  const match = html.slice(0, 3_000_000).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return results;
  try {
    const root = JSON.parse(match[1]);
    const products = root?.props?.pageProps?.data?.catalogServer?.data;
    if (!Array.isArray(products)) return results;
    for (const [index, node] of products.slice(0, 60).entries()) {
      const price = Number(node.priceWithDiscount || node.price || 0);
      const link = absoluteUrl(`/produto/${node.code}/${node.friendlyName || "produto"}`, base);
      results.push({
        id: `kabum-${node.code || index}`,
        title: node.name,
        price,
        originalPrice: Number(node.oldPrice || node.price || price || 0),
        currency: "BRL",
        link,
        image: absoluteUrl(node.image || node.images?.[0], base),
        store: "KaBuM!",
        condition: "Novo",
        rating: Number(node.rating || node.ratingValue || 0),
        reviewCount: Number(node.ratingCount || node.reviewCount || 0),
        sellerPositive: 0,
        sellerStatus: node.sellerName || "KaBuM!",
        soldQuantity: Number(node.quantitySold || 0),
        freeShipping: Boolean(node.freeShipping),
        officialStore: !node.sellerName,
        relevance: Math.max(.5, 1 - index / 72),
      });
    }
  } catch { /* As demais fontes continuam disponíveis se o catálogo mudar. */ }
  return results;
}

function comparisonProducts(html: string, base: string, comparisonSource: string) {
  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const match = html.slice(0, 3_000_000).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return results;
  try {
    const root = JSON.parse(match[1]);
    const queue: unknown[] = [root];
    while (queue.length && results.length < 45) {
      const value = queue.shift();
      if (Array.isArray(value)) { queue.push(...value); continue; }
      if (!value || typeof value !== "object") continue;
      const node = value as Record<string, any>;
      if (node.type === "product" && node.name && node.url && Number(node.price) > 0) {
        const key = String(node.objectId || node.sourceId || node.url);
        if (!seen.has(key)) {
          seen.add(key);
          const availableStores = Array.isArray(node.merchants) ? [...new Set(node.merchants.map((merchant: any) => String(merchant?.name || "")).filter(Boolean))] : [];
          const store = String(node.bestOffer?.merchantName || availableStores[0] || comparisonSource);
          results.push({
            id: `${comparisonSource.toLowerCase()}-${key}`,
            title: node.shortName || node.name,
            price: Number(node.price),
            originalPrice: 0,
            currency: "BRL",
            link: absoluteUrl(node.url, base),
            image: absoluteUrl(node.image, base),
            store,
            condition: "Novo",
            rating: Number(node.preciseRating || node.rating || 0),
            reviewCount: Number(node.countOfComments || node.ratingTotal || 0),
            sellerPositive: 0,
            sellerStatus: `${Number(node.storeCount || availableStores.length || 1)} loja(s) comparada(s)`,
            soldQuantity: Number(node.popularityScore || 0),
            freeShipping: false,
            officialStore: false,
            relevance: Math.max(.5, 1 - Number(node.position || results.length) / 48),
            comparisonSource,
            availableStores,
          });
        }
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
  } catch { /* A busca direta continua se o comparador alterar sua estrutura. */ }
  return results;
}

async function storeProducts(url: string, store: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        "cache-control": "no-cache",
      },
      signal: controller.signal,
    });
    if (!response.ok) return { items: [], status: `HTTP ${response.status}` };
    const html = await response.text();
    const structured = jsonLdProducts(html, url, store);
    const catalog = store === "Magazine Luiza" ? magaluProducts(html, url) : store === "KaBuM!" ? kabumProducts(html, url) : store === "Buscapé" || store === "Zoom" ? comparisonProducts(html, url, store) : [];
    const items = [...catalog, ...structured];
    return { items, status: items.length ? "ok" : "sem catálogo" };
  } catch (error) { return { items: [], status: error instanceof Error && error.name === "AbortError" ? "tempo esgotado" : "indisponível" }; }
  finally { clearTimeout(timeout); }
}

async function marketplaceJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3200);
  try {
    const response = await fetch(url, { headers: { "user-agent": "GWL-Nexo/2.0" }, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as Record<string, any>;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

async function marketplaceSignals(item: Record<string, any>, index: number, total: number) {
  const sellerId = Number(item.seller?.id || item.seller_id || 0);
  const [reviews, seller] = await Promise.all([
    marketplaceJson(`https://api.mercadolibre.com/reviews/item/${encodeURIComponent(String(item.id || ""))}`),
    sellerId ? marketplaceJson(`https://api.mercadolibre.com/users/${sellerId}`) : Promise.resolve(null),
  ]);
  const reputation = seller?.seller_reputation || {};
  const ratings = reputation.transactions?.ratings || {};
  return {
    rating: Number(reviews?.rating_average || 0),
    reviewCount: Number(reviews?.paging?.total || 0),
    sellerPositive: Number(ratings.positive || 0),
    sellerStatus: reputation.power_seller_status || reputation.level_id || "",
    soldQuantity: Number(item.sold_quantity || 0),
    officialStore: Boolean(item.official_store_id),
    relevance: Math.max(0, 1 - index / Math.max(total, 1)),
  };
}

function rankProducts(products: Array<Record<string, any>>, query: string) {
  const terms = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(term => term.length > 2);
  const seen = new Set<string>();
  const valid = products.filter(item => {
    if (!item.title || !item.link || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0 || !item.image) return false;
    const title = String(item.title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const synonyms:Record<string,RegExp>={fone:/fone|headset|headphone|earbud/,computador:/computador|desktop|mini pc|pc gamer/,notebook:/notebook|laptop/,celular:/celular|smartphone|iphone/,geladeira:/geladeira|refrigerador/};
    if (terms.length && !terms.filter(t=>!["para","com","sem","melhor","barato"].includes(t)).every(term=>synonyms[term]?synonyms[term].test(title):title.includes(term))) return false;
    if (/geladeira|refrigerador|lavadora|aspirador/.test(query.toLowerCase()) && !/peca|peça|motor|filtro|refil|acessorio|acessório|kit/.test(query.toLowerCase()) && /motoventilador|prateleira|refil|filtro|gaveta|borracha|puxador|placa |kit |peça|sensor|termostato|dobradiça/.test(title)) return false;
    if (title.trim() === query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() || title.length < 12) return false;
    try {
      const parsed = new URL(String(item.link));
      const direct = /mercadolivre\.com\.br\/.+-MLB-|magazineluiza\.com\.br\/.+\/p\/|kabum\.com\.br\/produto\/|buscape\.com\.br\/(?!search)|zoom\.com\.br\/(?!search)|shopee\.com\.br\/(?:product\/|.+-i\.\d+\.\d+)|shein\.com\/.+-p-\d+\.html|olx\.com\.br\/.+\/d\/anuncio\/|facebook\.com\/marketplace\/item\//i.test(parsed.toString());
      if (!direct && !["site.fastshop.com.br","loja.electrolux.com.br"].includes(parsed.hostname)) return false;
    } catch { return false; }
    const key = item.comparisonSource?"comparison:"+title.replace(/[^a-z0-9]/g,""):String(item.store)+":"+String(item.link).split("?")[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const prices = valid.map(item => Number(item.price)).filter(Boolean);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const minPrice = sortedPrices[0] || 0;
  const lowReference = sortedPrices[Math.floor((sortedPrices.length - 1) * .1)] || minPrice;
  const highReference = sortedPrices[Math.floor((sortedPrices.length - 1) * .9)] || lowReference || 1;
  const maxReviews = Math.max(...valid.map(item => Number(item.reviewCount || 0)), 1);
  const maxSales = Math.max(...valid.map(item => Number(item.soldQuantity || 0)), 1);
  const ranked: Array<Record<string, any>> = valid.map(item => {
    const ratingScore = item.rating ? Number(item.rating) / 5 : 0;
    const reviewsScore = Math.log1p(Number(item.reviewCount || 0)) / Math.log1p(maxReviews);
    const sellerScore = Number(item.sellerPositive || 0);
    const price = Number(item.price);
    const priceScore = price ? 1 - Math.min(1, Math.max(0, (Math.log(price) - Math.log(Math.max(lowReference, 1))) / Math.max(Math.log(Math.max(highReference, 2)) - Math.log(Math.max(lowReference, 1)), .01))) : 0;
    const title = String(item.title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const textScore = terms.length ? terms.filter(term => title.includes(term)).length / terms.length : .5;
    const salesScore = Math.log1p(Number(item.soldQuantity || 0)) / Math.log1p(maxSales);
    const score = ratingScore * 24 + reviewsScore * 10 + sellerScore * 13 + Number(item.relevance || 0) * 11 + textScore * 17 + priceScore * 16 + salesScore * 3 + (item.freeShipping ? 3 : 0) + (item.officialStore ? 3 : 0);
    const savingsPercent = Number(item.originalPrice) > price ? Math.round((1 - price / Number(item.originalPrice)) * 100) : 0;
    return { ...item, score: Math.min(99, Math.round(score)), savingsPercent };
  }).sort((a, b) => b.score - a.score).slice(0, 60);
  const cheapestId = [...ranked].sort((a, b) => Number(a.price) - Number(b.price))[0]?.id;
  const bestRatedId = [...ranked].filter(item => item.rating >= 4 && item.reviewCount >= 3).sort((a, b) => Number(b.rating) - Number(a.rating) || Number(b.reviewCount) - Number(a.reviewCount))[0]?.id;
  return ranked.map((item, index) => ({ ...item, badge: index === 0 ? "Melhor custo-benefício" : item.id === cheapestId ? "Menor preço" : item.id === bestRatedId ? "Melhor avaliado" : item.savingsPercent >= 10 ? `${item.savingsPercent}% de desconto` : item.freeShipping ? "Frete grátis" : "Oferta recomendada" }));
}

async function productSearch(query: string, page = 0) {
  if (fashionIntent(query).fashion) return searchFashion(query,page);
  const encoded = encodeURIComponent(query);
  const searchPages = [
    { name: "Buscapé", url: `https://www.buscape.com.br/search?q=${encoded}&page=${page+1}` },
    { name: "Zoom", url: `https://www.zoom.com.br/search?q=${encoded}&page=${page+1}` },
    { name: "KaBuM!", url: `https://www.kabum.com.br/busca/${encoded}?page_number=${page+1}&page_size=60` },
  ];
  const extraPending = Promise.all(searchPages.map((shop) => storeProducts(shop.url, shop.name)));
  const catalogStores = [{name:"Fast Shop",host:"site.fastshop.com.br"},{name:"Electrolux",host:"loja.electrolux.com.br"}];
  const directPending=Promise.all(catalogStores.map(async store=>{
    try {const response=await fetch(`https://${store.host}/api/catalog_system/pub/products/search?ft=${encoded}&_from=${page*24}&_to=${page*24+23}`,{signal:AbortSignal.timeout(18000),headers:{accept:"application/json"}});
      return {name:store.name,items:response.ok?parseFashionCatalog(await response.json(),store):[]};
    }catch{return {name:store.name,items:[]};}
  }));
  let results: Array<Record<string, unknown>> = [];
  try {
    const data = await marketplaceJson(`https://api.mercadolibre.com/sites/MLB/search?q=${encoded}&limit=18&offset=${page*18}`) as { results?: Array<Record<string, unknown>> } | null;
    if (data) {
      const source = (data.results || []).slice(0, 18);
      const signals = await Promise.all(source.map((item, index) => marketplaceSignals(item, index, source.length)));
      results = source.map((item, index) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        currency: item.currency_id || "BRL",
        link: item.permalink,
        image: item.thumbnail,
        store: "Mercado Livre",
        condition: item.condition === "new" ? "Novo" : "Usado",
        originalPrice: item.original_price,
        freeShipping: (item.shipping as Record<string, unknown> | undefined)?.free_shipping || false,
        ...signals[index],
      }));
    }
  } catch { /* Links de busca continuam disponíveis. */ }
  const marketplaceCount = results.length;
  const [extra, directCatalogs] = await Promise.all([extraPending, directPending]);
  const catalogItems = [...extra.flatMap(result => result.items),...directCatalogs.flatMap(result=>result.items)];
  const inspectedCount = results.length + catalogItems.length;
  results = rankProducts([...results, ...catalogItems], query);
  const sourceMap = new Map<string, { name: string; found: number; status: string }>();
  searchPages.forEach((shop, index) => {
    const current = sourceMap.get(shop.name) || { name: shop.name, found: 0, status: "indisponível" };
    current.found += extra[index].items.length;
    if (extra[index].status === "ok") current.status = "consultada";
    else if (current.status !== "consultada") current.status = extra[index].status;
    sourceMap.set(shop.name, current);
  });
  directCatalogs.forEach(shop=>sourceMap.set(shop.name,{name:shop.name,found:shop.items.length,status:shop.items.length?"consultada":"Catálogo indisponível ou sem estoque"}));
  const mercadoSource = sourceMap.get("Mercado Livre") || { name: "Mercado Livre", found: 0, status: "indisponível" };
  mercadoSource.found += marketplaceCount;
  if (marketplaceCount) mercadoSource.status = "consultada";
  sourceMap.set("Mercado Livre", mercadoSource);
  const retailerCounts = new Map<string, number>();
  for (const item of results) {
    const names = Array.isArray(item.availableStores) && item.availableStores.length ? item.availableStores : [item.store];
    for (const name of names) retailerCounts.set(String(name), (retailerCounts.get(String(name)) || 0) + 1);
  }
  if (marketplaceCount) retailerCounts.set("Mercado Livre", marketplaceCount);
  const retailers = [...retailerCounts.entries()].map(([name, found]) => ({ name, found })).sort((a, b) => b.found - a.found || a.name.localeCompare(b.name)).slice(0, 14);
  const stores = [
    { name: "Mercado Livre", url: `https://lista.mercadolivre.com.br/${encoded}`, color: "#ffe600" },
    { name: "Amazon Brasil", url: `https://www.amazon.com.br/s?k=${encoded}`, color: "#ff9900" },
    { name: "Magazine Luiza", url: `https://www.magazineluiza.com.br/busca/${encoded}/`, color: "#0086ff" },
    { name: "Casas Bahia", url: `https://www.casasbahia.com.br/${encoded}/b`, color: "#e31b36" },
    { name: "Shopee", url: `https://shopee.com.br/search?keyword=${encoded}`, color: "#ee4d2d" },
    { name: "SHEIN", url: `https://br.shein.com/pdsearch/${encoded}/`, color: "#111111" },
    { name: "OLX", url: `https://www.olx.com.br/brasil?q=${encoded}`, color: "#6e0ad6" },
    { name: "Facebook Marketplace", url: `https://www.facebook.com/marketplace/search/?query=${encoded}`, color: "#1877f2" },
  ];
  return {
    results, page, hasMore:page<9 && results.length>0,
    inspectedCount,
    sources: [...sourceMap.values()].map(source=>({...source,found:results.filter((item:any)=>item.store===source.name).length,status:source.found&&!results.some((item:any)=>item.store===source.name)?"Sem anúncios compatíveis":source.status})),
    retailers,
    criteria: ["Relevância", "Preço", "Avaliação", "Reputação do vendedor", "Volume de vendas", "Frete"],
    ads: stores.map((store) => ({ ...store, title: `Ofertas de ${query}`, subtitle: `Veja anúncios e condições atuais na ${store.name}` })),
    stores,
    updatedAt: new Date().toISOString(),
  };
}

async function publicContent(request: Request, key: string, seconds: number, get: () => Promise<any>) {
  // Cache is optional: some hosted runtimes expose it but reject match/put.
  // A cache failure must never prevent retrieval of news or products.
  let cache: Cache | undefined;
  let cacheKey: Request | undefined;
  try {
    cache = (globalThis as any).caches?.default;
    cacheKey = new Request(new URL("/__planner_public_cache/v75/" + encodeURIComponent(key), request.url));
    const cached = await cache?.match(cacheKey);
    if (cached?.ok) {
      const data = await cached.json() as any;
      if (Array.isArray(data?.news) || Array.isArray(data?.results)) {
        return Response.json(data, {headers:{"cache-control":"private, max-age=30"}});
      }
    }
  } catch {
    cache = undefined;
  }
  const data = await get();
  if ((data.news?.length || data.results?.length) && cache && cacheKey) {
    try {
      await cache.put(cacheKey, Response.json(data, {headers:{"cache-control":`public, max-age=${seconds}`}}));
    } catch { /* Fresh data remains usable if caching is unsupported. */ }
  }
  return Response.json(data, {headers:{"cache-control":"private, max-age=30"}});
}

export async function GET(request: Request) {
  try {
    const { db, bucket } = await resources();
    const user = await current(request, db);
    if (!user) return bad("Entre no GWL Planner para continuar.", 401);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "bootstrap";

    if (action === "news") return await publicContent(request,"news",120,async()=>({news:await latestNews(),updatedAt:new Date().toISOString()}));
    if (action === "products") {
      const query = text(url.searchParams.get("q"), 140);
      if (!query) return bad("Digite o produto que deseja pesquisar.");
      const page = Math.max(0, Math.min(9, Number(url.searchParams.get("page")) || 0));
      return await publicContent(request,`products:${query.toLowerCase()}:${page}`,180,()=>productSearch(query,page));
    }
    if (action === "sync") {
      const [threads,unread,tasks] = await Promise.all([
        db.prepare("SELECT DISTINCT t.* FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.kind='general' OR t.created_by=? OR m.member_email=? ORDER BY t.created_at DESC").bind(user.email,user.email).all(),
        db.prepare("SELECT t.id AS thread_id,COUNT(msg.id) AS unread_count FROM planner_threads t JOIN planner_messages msg ON msg.thread_id=t.id LEFT JOIN planner_thread_reads r ON r.thread_id=t.id AND r.member_email=? WHERE (t.kind='general' OR t.created_by=? OR EXISTS (SELECT 1 FROM planner_thread_members m WHERE m.thread_id=t.id AND m.member_email=?)) AND msg.id>COALESCE(r.last_read_message_id,0) AND msg.sender_email<>? GROUP BY t.id").bind(user.email,user.email,user.email,user.email).all(),
        visibleTasks(db,user.email)
      ]);
      return Response.json({threads:threads.results||[],unread:unread.results||[],tasks:tasks.results||[],user},{headers:{"cache-control":"no-store"}});
    }
    if (action === "messages") {
      const threadId=text(url.searchParams.get("thread"),80);
      const allowed=await db.prepare("SELECT t.id FROM planner_threads t WHERE t.id=? AND (t.kind='general' OR t.created_by=? OR EXISTS (SELECT 1 FROM planner_thread_members m WHERE m.thread_id=t.id AND m.member_email=?))").bind(threadId,user.email,user.email).first();
      if(!allowed)return bad("Você não participa desta conversa.",403);
      const before=Math.max(0,Number(url.searchParams.get("before"))||0);
      const after=Math.max(0,Number(url.searchParams.get("after"))||0);
      const rows=await db.prepare("SELECT * FROM planner_messages WHERE thread_id=? AND id>? AND id<? ORDER BY id " + (after?"ASC":"DESC") + " LIMIT 61").bind(threadId,after,before||Number.MAX_SAFE_INTEGER).all();
      const batch=(rows.results||[]).slice(0,60).sort((a:any,b:any)=>a.id-b.id);
      const ids=batch.map((m:any)=>Number(m.id));
      const attachments=await db.prepare("SELECT a.id,a.message_id,a.file_name,a.content_type,a.size FROM planner_message_attachments a JOIN planner_messages msg ON msg.id=a.message_id WHERE msg.thread_id=? AND (msg.id IN (SELECT id FROM planner_messages WHERE thread_id=? ORDER BY id DESC LIMIT 60)"+(ids.length?" OR msg.id IN ("+ids.map(()=>"?").join(",")+")":"")+")").bind(threadId,threadId,...ids).all();
      return Response.json({messages:batch,attachments:attachments.results||[],hasMore:(rows.results||[]).length>60},{headers:{"cache-control":"no-store"}});
    }
    if (action === "document") {
      const id = Number(url.searchParams.get("id"));
      const doc = await db.prepare("SELECT * FROM planner_documents WHERE id=? AND owner_email=?").bind(id, user.email).first<Record<string, unknown>>();
      if (!doc) return bad("Documento não encontrado.", 404);
      const object = await bucket.get(String(doc.object_key));
      if (!object) return bad("Arquivo não encontrado.", 404);
      return new Response(object.body, { headers: { "content-type": String(doc.content_type || object.httpMetadata?.contentType || "application/octet-stream"), "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(doc.file_name))}` } });
    }
    if (action === "message.attachment") {
      const id = Number(url.searchParams.get("id"));
      const attachment = await db.prepare("SELECT a.* FROM planner_message_attachments a JOIN planner_messages msg ON msg.id=a.message_id JOIN planner_threads t ON t.id=msg.thread_id LEFT JOIN planner_thread_members m ON m.thread_id=t.id AND m.member_email=? WHERE a.id=? AND (t.kind='general' OR t.created_by=? OR m.member_email=?) LIMIT 1")
        .bind(user.email, id, user.email, user.email).first<Record<string, unknown>>();
      if (!attachment) return bad("Anexo não encontrado ou sem permissão.", 404);
      const object = await bucket.get(String(attachment.object_key));
      if (!object) return bad("Arquivo não encontrado.", 404);
      const contentType = String(attachment.content_type || object.httpMetadata?.contentType || "application/octet-stream");
      const disposition = contentType.startsWith("image/") || contentType === "application/pdf" ? "inline" : "attachment";
      return new Response(object.body, { headers: {
        "content-type": contentType,
        "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(String(attachment.file_name))}`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      } });
    }

    await ensureGeneral(db);
    const [profiles, tasks, events, threads, messages, attachments, documents, links, boards, unread] = await Promise.all([
      db.prepare("SELECT email,name,role,planner_role,employee_id,site_id FROM ponto_access_profiles WHERE status='active' ORDER BY name").all(),
      visibleTasks(db,user.email),
      db.prepare("SELECT * FROM planner_events WHERE owner_email=? ORDER BY event_date,event_time").bind(user.email).all(),
      db.prepare("SELECT DISTINCT t.* FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.kind='general' OR t.created_by=? OR m.member_email=? ORDER BY t.created_at DESC").bind(user.email, user.email).all(),
      db.prepare("SELECT * FROM planner_messages WHERE thread_id IN (SELECT id FROM planner_threads WHERE kind='general' OR created_by=? OR id IN (SELECT thread_id FROM planner_thread_members WHERE member_email=?)) ORDER BY id DESC LIMIT 40").bind(user.email, user.email).all(),
      db.prepare("SELECT a.* FROM planner_message_attachments a JOIN planner_messages msg ON msg.id=a.message_id WHERE msg.thread_id IN (SELECT id FROM planner_threads WHERE kind='general' OR created_by=? OR id IN (SELECT thread_id FROM planner_thread_members WHERE member_email=?)) ORDER BY a.id DESC LIMIT 40").bind(user.email, user.email).all(),
      db.prepare("SELECT * FROM planner_documents WHERE owner_email=? ORDER BY updated_at DESC").bind(user.email).all(),
      db.prepare("SELECT * FROM planner_links WHERE owner_email=? ORDER BY created_at DESC").bind(user.email).all(),
      db.prepare("SELECT * FROM planner_boards WHERE owner_email=? OR allowed_emails LIKE ? ORDER BY CASE WHEN owner_email=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 100").bind(user.email, `%\"${user.email}\"%`, user.email).all(),
      db.prepare("SELECT t.id AS thread_id,COUNT(msg.id) AS unread_count FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id AND lower(m.member_email)=lower(?) JOIN planner_messages msg ON msg.thread_id=t.id LEFT JOIN planner_thread_reads r ON r.thread_id=t.id AND lower(r.member_email)=lower(?) WHERE (t.kind='general' OR lower(t.created_by)=lower(?) OR m.member_email IS NOT NULL) AND msg.id>COALESCE(r.last_read_message_id,0) AND lower(msg.sender_email)<>lower(?) GROUP BY t.id").bind(user.email, user.email, user.email, user.email).all(),
    ]);
    const visibleBoards = boards.results || [];
    return Response.json({ user, profiles: profiles.results || [], tasks: tasks.results || [], events: events.results || [], threads: threads.results || [], messages: (messages.results || []).reverse(), attachments: attachments.results || [], documents: documents.results || [], links: links.results || [], boards: visibleBoards, board: visibleBoards[0] || null, unread: unread.results || [] });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Não foi possível carregar o GWL Planner.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const { db, bucket } = await resources();
    const user = await current(request, db);
    if (!user) return bad("Sua sessão expirou. Entre novamente.", 401);
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const formAction = String(form.get("action") || "");
      if (formAction === "message.send") {
        const threadId = text(form.get("threadId"), 80);
        const message = text(form.get("message"), 5000);
        const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 5);
        if (!threadId || (!message && !files.length)) return bad("Digite uma mensagem ou selecione um arquivo.");
        if (form.getAll("files").length > 5) return bad("Envie no máximo cinco arquivos por mensagem.");
        if (files.some(file => file.size > 10 * 1024 * 1024)) return bad("Cada arquivo deve ter no máximo 10 MB.");
        if (files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) return bad("Os anexos da mensagem devem somar no máximo 25 MB.");
        if (files.some(file => !allowedMessengerFile(file))) return bad("Formato não permitido. Use imagens, PDF, texto, ZIP ou arquivos do Word, Excel e PowerPoint.");
        const allowed = await db.prepare("SELECT t.id FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.id=? AND (t.kind='general' OR t.created_by=? OR m.member_email=?) LIMIT 1").bind(threadId, user.email, user.email).first();
        if (!allowed) return bad("Você não participa desta conversa.", 403);
        const result = await db.prepare("INSERT INTO planner_messages (thread_id,sender_email,sender_name,body) VALUES (?,?,?,?)").bind(threadId, user.email, user.name, message).run();
        const messageId = Number(result.meta?.last_row_id);
        const uploaded: string[] = [];
        try {
          for (const file of files) {
            const key = `planner/messenger/${threadId}/${messageId}/${crypto.randomUUID()}`;
            await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
            uploaded.push(key);
            await db.prepare("INSERT INTO planner_message_attachments (message_id,file_name,object_key,content_type,size) VALUES (?,?,?,?,?)")
              .bind(messageId, file.name.slice(0, 240), key, file.type || "application/octet-stream", file.size).run();
          }
        } catch (error) {
          await Promise.allSettled(uploaded.map(key => bucket.delete(key)));
          await db.prepare("DELETE FROM planner_messages WHERE id=? AND sender_email=?").bind(messageId, user.email).run();
          throw error;
        }
        return Response.json({ ok: true, id: messageId, attachments: files.length });
      }
      if (formAction !== "document.upload") return bad("Ação inválida.");
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) return bad("Selecione um arquivo.");
      if (file.size > 25 * 1024 * 1024) return bad("O arquivo deve ter no máximo 25 MB.");
      const key = `planner/${user.email}/${crypto.randomUUID()}`;
      await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      const result = await db.prepare("INSERT INTO planner_documents (owner_email,file_name,object_key,content_type,size) VALUES (?,?,?,?,?)")
        .bind(user.email, file.name.slice(0, 240), key, file.type || "application/octet-stream", file.size).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }

    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 60);
    if (action.startsWith("task.") || action === "planner.role.update") return await taskAction(db,user,body);
    if (action === "event.create") {
      const title = text(body.title, 220), date = text(body.eventDate, 20); if (!title || !date) return bad("Informe o evento e a data.");
      const result = await db.prepare("INSERT INTO planner_events (owner_email,title,event_date,event_time,emoji,color,notes) VALUES (?,?,?,?,?,?,?)")
        .bind(user.email, title, date, text(body.eventTime, 10), text(body.emoji, 12) || "📌", text(body.color, 20) || "#4f7cff", text(body.notes)).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    if (action === "event.delete") { await db.prepare("DELETE FROM planner_events WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).run(); return Response.json({ ok: true }); }
    if (action === "group.create") {
      const title = text(body.title, 120); if (!title) return bad("Informe o nome do grupo.");
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO planner_threads (id,title,kind,created_by) VALUES (?,?, 'group',?)").bind(id, title, user.email).run();
      const members = Array.isArray(body.members) ? body.members.map(cleanEmail).filter(Boolean).slice(0, 100) : [];
      await db.prepare("INSERT OR IGNORE INTO planner_thread_members (thread_id,member_email) VALUES (?,?)").bind(id, user.email).run();
      for (const member of members) await db.prepare("INSERT OR IGNORE INTO planner_thread_members (thread_id,member_email) VALUES (?,?)").bind(id, member).run();
      return Response.json({ ok: true, id });
    }
    if (action === "message.send") {
      const threadId = text(body.threadId, 80), message = text(body.message, 5000); if (!threadId || !message) return bad("Digite uma mensagem.");
      const allowed = await db.prepare("SELECT t.id FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id WHERE t.id=? AND (t.kind='general' OR t.created_by=? OR m.member_email=?) LIMIT 1").bind(threadId, user.email, user.email).first();
      if (!allowed) return bad("Você não participa desta conversa.", 403);
      const result = await db.prepare("INSERT INTO planner_messages (thread_id,sender_email,sender_name,body) VALUES (?,?,?,?)").bind(threadId, user.email, user.name, message).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    if (action === "message.read") {
      const threadId = text(body.threadId, 80);
      const allowed = await db.prepare("SELECT t.id FROM planner_threads t LEFT JOIN planner_thread_members m ON m.thread_id=t.id AND lower(m.member_email)=lower(?) WHERE t.id=? AND (t.kind='general' OR lower(t.created_by)=lower(?) OR m.member_email IS NOT NULL) LIMIT 1").bind(user.email, threadId, user.email).first();
      if (!allowed) return bad("Você não participa desta conversa.", 403);
      const last = await db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM planner_messages WHERE thread_id=? AND id<=?").bind(threadId, Math.max(0, Number(body.lastId)||0)).first<Record<string, unknown>>();
      await db.prepare("INSERT INTO planner_thread_reads (thread_id,member_email,last_read_message_id,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(thread_id,member_email) DO UPDATE SET last_read_message_id=MAX(planner_thread_reads.last_read_message_id,excluded.last_read_message_id),updated_at=CURRENT_TIMESTAMP")
        .bind(threadId, user.email, Number(last?.id || 0)).run();
      return Response.json({ ok: true });
    }
    if (action === "document.rename") {
      const name = text(body.fileName, 240); if (!name) return bad("Informe o novo nome.");
      await db.prepare("UPDATE planner_documents SET file_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?").bind(name, Number(body.id), user.email).run();
      return Response.json({ ok: true });
    }
    if (action === "document.delete") {
      const doc = await db.prepare("SELECT object_key FROM planner_documents WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).first<Record<string, unknown>>();
      if (doc) { await bucket.delete(String(doc.object_key)); await db.prepare("DELETE FROM planner_documents WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).run(); }
      return Response.json({ ok: true });
    }
    if (action === "board.save") {
      const allowed = Array.isArray(body.allowedEmails) ? body.allowedEmails.map(cleanEmail).filter(Boolean).slice(0, 200) : [];
      const boardId = text(body.boardId, 80) || crypto.randomUUID();
      const existing = await db.prepare("SELECT owner_email,allowed_emails FROM planner_boards WHERE id=?").bind(boardId).first<Record<string, unknown>>();
      let existingAllowed: string[] = [];
      try { existingAllowed = JSON.parse(String(existing?.allowed_emails || "[]")); } catch { existingAllowed = []; }
      if (existing && existing.owner_email !== user.email && !existingAllowed.includes(user.email)) return bad("Você não pode alterar esta lousa.", 403);
      if (!existing) {
        await db.prepare("INSERT INTO planner_boards (id,title,owner_email,allowed_emails,payload,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)").bind(boardId, text(body.title, 120) || "Minha lousa", user.email, JSON.stringify(allowed), text(body.payload, 250000) || "[]").run();
      } else if (existing.owner_email === user.email) {
        await db.prepare("UPDATE planner_boards SET title=?,allowed_emails=?,payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?").bind(text(body.title, 120) || "Minha lousa", JSON.stringify(allowed), text(body.payload, 250000) || "[]", boardId, user.email).run();
      } else {
        await db.prepare("UPDATE planner_boards SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text(body.payload, 250000) || "[]", boardId).run();
      }
      return Response.json({ ok: true, id: boardId });
    }
    if (action === "board.delete") { const boardId=text(body.boardId,80);await db.prepare("DELETE FROM planner_boards WHERE id=? AND owner_email=?").bind(boardId,user.email).run();return Response.json({ok:true}); }
    if (action === "link.create") {
      const title = text(body.title, 120), url = text(body.url, 900); if (!title || !/^https?:\/\//i.test(url)) return bad("Informe um nome e um link válido começando com http.");
      const result = await db.prepare("INSERT INTO planner_links (owner_email,title,url,kind,color) VALUES (?,?,?,?,?)").bind(user.email, title, url, text(body.kind, 20) || "site", text(body.color, 20) || "#4f7cff").run();
      return Response.json({ ok: true, id: result.meta?.last_row_id });
    }
    if (action === "link.delete") { await db.prepare("DELETE FROM planner_links WHERE id=? AND owner_email=?").bind(Number(body.id), user.email).run(); return Response.json({ ok: true }); }
    return bad("Ação não reconhecida.");
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Não foi possível concluir a operação.", 500);
  }
}
