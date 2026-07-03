const APIFY_CENDOJ_URL = "https://api.apify.com/v2/acts/legaltech~cendoj/run-sync-get-dataset-items";
const APIFY_TJUE_URL = "https://api.apify.com/v2/acts/legaltech~tjue/run-sync-get-dataset-items";

const WEEKLY_LIMIT = 5;
const HARD_MAX_RESULTS = 20;
const RESEARCH_MAX_QUERIES = 3;
const ALLOWED_ORIGINS = [
  "https://technology-advisory.github.io",
  "https://lexradar.es",
  "https://www.lexradar.es"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return corsResponse(request);

    if (url.pathname === "/" && request.method === "GET") {
      return jsonResponse(request, {
        ok: true,
        service: "LexRadar API",
        version: "1.0.0",
        mode: "legal research engine without AI",
        weeklyLimit: WEEKLY_LIMIT,
        sources: ["CENDOJ", "TJUE"],
        apifyConfigured: Boolean(env.APIFY_TOKEN),
        dbConfigured: Boolean(env.DB)
      });
    }

    if (url.pathname === "/me" && request.method === "GET") return handleMe(request, env);
    if (url.pathname === "/search" && request.method === "POST") return handleSearch(request, env);
    if (url.pathname === "/research" && request.method === "POST") return handleResearch(request, env);

    return jsonResponse(request, { ok: false, error: "Not found" }, 404);
  }
};

async function handleMe(request, env) {
  const user = getUser(request, env);
  if (env.DB) await ensureSchema(env);
  const quota = env.DB ? await getQuota(env, user.email) : { limit: WEEKLY_LIMIT, used: 0, remaining: WEEKLY_LIMIT, week: getWeekKey(), mode: "frontend-local" };
  return jsonResponse(request, { ok: true, user, quota });
}

async function handleSearch(request, env) {
  const guard = await beforeOperation(request, env);
  if (!guard.ok) return guard.response;

  const body = guard.body;
  const query = String(body.query || "").trim();
  const maxResults = Math.min(Number(body.maxResults || 10), HARD_MAX_RESULTS);
  const source = normalizeSource(body.source || "cendoj");
  const startedAt = new Date().toISOString();

  const results = await runBySource(env, source, query, maxResults);

  if (!results.ok) {
    if (env.DB) await logSearch(env, guard.user.email, query, source.toUpperCase(), 0, "apify_error", startedAt);
    return jsonResponse(request, results, 502);
  }

  if (env.DB) {
    await consumeQuota(env, guard.user.email);
    await logSearch(env, guard.user.email, query, source.toUpperCase(), results.items.length, "ok", startedAt);
  }
  const quota = env.DB ? await getQuota(env, guard.user.email) : null;

  return jsonResponse(request, {
    ok: true,
    source: sourceHumanLabel(source),
    sources: source === "both" ? ["CENDOJ", "TJUE"] : [sourceHumanLabel(source)],
    count: results.items.length,
    user: guard.user,
    quota,
    results: results.items
  });
}

async function handleResearch(request, env) {
  const guard = await beforeOperation(request, env);
  if (!guard.ok) return guard.response;

  const body = guard.body;
  const question = String(body.query || "").trim();
  const maxResults = Math.min(Number(body.maxResults || 10), 10);
  const requestedSource = normalizeSource(body.source || inferSource(question));
  const plan = buildResearchPlan(question, requestedSource, body.mode === "ai");
  const startedAt = new Date().toISOString();

  let allResults = [];
  const execution = [];

  for (const planned of plan.searches.slice(0, RESEARCH_MAX_QUERIES * 2)) {
    const raw = await runBySource(env, planned.source, planned.query, maxResults, {
      paragraphs: 3,
      paragraphTerms: plan.paragraphTerms
    });
    execution.push({ source: sourceHumanLabel(planned.source), query: planned.query, ok: raw.ok, count: Array.isArray(raw.items) ? raw.items.length : 0 });
    if (raw.ok && Array.isArray(raw.items)) allResults = allResults.concat(raw.items);
  }

  const results = dedupeResults(allResults)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  if (env.DB) {
    await consumeQuota(env, guard.user.email);
    await logSearch(env, guard.user.email, question, `RESEARCH_${sourceHumanLabel(requestedSource)}`, results.length, "ok", startedAt);
  }
  const quota = env.DB ? await getQuota(env, guard.user.email) : null;

  return jsonResponse(request, {
    ok: true,
    mode: body.mode === "ai" ? "ai-without-ai" : "research-no-ai",
    source: sourceHumanLabel(requestedSource),
    sources: [...new Set(plan.searches.map((s) => sourceHumanLabel(s.source)))],
    user: guard.user,
    quota,
    plan: {
      strategy: plan.strategy,
      queries: plan.searches.map((s) => `${sourceHumanLabel(s.source)}: ${s.query}`),
      paragraphTerms: plan.paragraphTerms,
      note: plan.note
    },
    execution,
    tjueStatus: plan.searches.some((s) => s.source === "tjue") ? "incluido" : "no solicitado",
    metrics: {
      executedQueries: execution.length,
      rawResults: allResults.length,
      deduplicated: results.length
    },
    comparisonRows: results.map(toComparisonRow),
    results
  });
}

async function beforeOperation(request, env) {
  if (!env.APIFY_TOKEN) return { ok: false, response: jsonResponse(request, { ok: false, error: "APIFY_TOKEN no configurado" }, 500) };
  if (env.DB) await ensureSchema(env);

  const user = getUser(request, env);
  if (env.DB) {
    const before = await getQuota(env, user.email);
    if (before.remaining <= 0) {
      return { ok: false, response: jsonResponse(request, {
        ok: false,
        code: "QUOTA_EXCEEDED",
        error: `Has consumido tus ${WEEKLY_LIMIT} búsquedas de esta semana.`,
        user,
        quota: before
      }, 429) };
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.query) return { ok: false, response: jsonResponse(request, { ok: false, error: "Falta query" }, 400) };
  return { ok: true, user, body };
}

async function runBySource(env, source, query, maxResults, options = {}) {
  if (source === "cendoj") return runCendoj(env, buildCendojInput({ query, maxResults, ...options }));
  if (source === "tjue") return runTjue(env, buildTjueInput({ query, maxResults, ...options }));
  if (source === "both") {
    const [cendoj, tjue] = await Promise.all([
      runCendoj(env, buildCendojInput({ query, maxResults, ...options })),
      runTjue(env, buildTjueInput({ query, maxResults, ...options }))
    ]);
    if (!cendoj.ok && !tjue.ok) return { ok: false, error: "Error llamando a CENDOJ y TJUE", details: { cendoj, tjue } };
    return { ok: true, items: [...(cendoj.items || []), ...(tjue.items || [])] };
  }
  return { ok: false, error: "Fuente no soportada" };
}

function buildResearchPlan(question, requestedSource, aiLike = false) {
  const q = question.toLowerCase();
  const terms = [];

  if (q.includes("gastos") || q.includes("hipotec")) {
    terms.push("gastos hipotecarios prescripción principio de efectividad");
    terms.push("dies a quo gastos hipotecarios prescripción consumidor");
    terms.push("cláusula abusiva restitución gastos hipotecarios Directiva 93/13");
  } else if (q.includes("comisión") && q.includes("apertura")) {
    terms.push("comisión de apertura requisitos de validez");
    terms.push("comisión de apertura transparencia consumidor");
    terms.push("comisión de apertura préstamo hipotecario");
  } else if (q.includes("irph")) {
    terms.push("IRPH control de transparencia consumidor");
    terms.push("IRPH cláusula abusiva Directiva 93/13");
    terms.push("IRPH Tribunal Supremo TJUE");
  } else {
    terms.push(question);
    terms.push(`${question} consumidor`);
    terms.push(`${question} principio de efectividad`);
  }

  const sources = requestedSource === "both" ? ["cendoj", "tjue"] : [requestedSource];
  const searches = [];
  for (const source of sources) {
    for (const query of terms.slice(0, RESEARCH_MAX_QUERIES)) searches.push({ source, query });
  }

  return {
    strategy: aiLike ? "ai-without-ai-rules-multisource" : "multi-source-search-dedupe-timeline",
    searches,
    paragraphTerms: "prescripción principio de efectividad dies a quo consumidor TJUE cláusula abusiva Directiva 93/13",
    note: aiLike
      ? "Modo IA sin IA: reglas + búsquedas multifuente + deduplicación + cronología. No se llama a ningún modelo de IA."
      : "Motor sin IA: reglas + búsquedas + deduplicación + tabla. No genera conclusiones doctrinales automáticas."
  };
}

function buildCendojInput({ query, maxResults = 10, paragraphs = 0, paragraphTerms = "" }) {
  return {
    searchTerms: [query],
    jurisdictions: ["CIVIL"],
    organoTypes: ["11|12|13|14|15|16"],
    resolutionTypes: ["SENTENCIA"],
    maxResults: Math.min(Number(maxResults || 10), HARD_MAX_RESULTS),
    paragraphs,
    paragraphTerms,
    sortOrder: "IN_FECHARESOLUCION:decreasing",
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: "ES"
    }
  };
}

function buildTjueInput({ query, maxResults = 10, paragraphs = 0, paragraphTerms = "" }) {
  return {
    searchTerms: [query],
    documentType: "arret",
    courts: ["C"],
    language: "es",
    dateType: "pro",
    maxResults: Math.min(Number(maxResults || 10), HARD_MAX_RESULTS),
    paragraphs,
    paragraphTerms
  };
}

async function runCendoj(env, input) {
  const items = await postApify(env, APIFY_CENDOJ_URL, input);
  if (!items.ok) return items;
  return { ok: true, items: normalizeCendojResults(items.items) };
}

async function runTjue(env, input) {
  const items = await postApify(env, APIFY_TJUE_URL, input);
  if (!items.ok) return items;
  return { ok: true, items: normalizeTjueResults(items.items) };
}

async function postApify(env, endpoint, input) {
  const apifyUrl = `${endpoint}?token=${encodeURIComponent(env.APIFY_TOKEN)}`;
  const response = await fetch(apifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const items = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: "Error llamando a Apify", status: response.status, details: items };
  return { ok: true, items: Array.isArray(items) ? items : [] };
}

function normalizeCendojResults(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const ecli = item.ecli || item.ECLI || "";
    const roj = item.roj || item.ROJ || item.sts || "";
    const id = ecli || roj || item.url || item.pdfUrl || `cendoj-${index}`;
    return {
      id,
      source: "CENDOJ",
      date: item.resolutionDateISO || item.fechaResolucion || item.date || "",
      court: item.organo || item.court || item.tribunal || "Tribunal Supremo",
      jurisdiction: item.jurisdiction || item.jurisdiccion || "Civil",
      identifier: [ecli, roj].filter(Boolean).join(" / "),
      ecli,
      roj,
      title: item.title || item.titulo || [item.organo, item.fechaResolucion, ecli || roj].filter(Boolean).join(" · "),
      summary: textFrom(item.summary || item.resumen || item.extract || item.paragraphs || item.text || "Resultado devuelto por CENDOJ."),
      url: item.url || item.pdfUrl || item.documentUrl || ""
    };
  });
}

function normalizeTjueResults(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const ecli = item.ecli || item.ECLI || "";
    const caseNumber = item.caseNumber || item.case || item.numeroAsunto || item.affaire || "";
    const url = item.documentUrl || item.url || item.pdfUrl || "";
    const id = ecli || caseNumber || url || `tjue-${index}`;
    const date = item.date || item.documentDate || item.judgmentDate || item.fecha || item.fechaDocumento || "";
    return {
      id,
      source: "TJUE",
      date,
      court: item.court || item.courtName || item.organo || "Tribunal de Justicia de la Unión Europea",
      jurisdiction: item.documentType || item.type || "Sentencia",
      identifier: [ecli, caseNumber].filter(Boolean).join(" / "),
      ecli,
      roj: "",
      caseNumber,
      title: item.title || item.titulo || item.name || [caseNumber, ecli].filter(Boolean).join(" · ") || "Documento TJUE",
      summary: textFrom(item.summary || item.resumen || item.extract || item.paragraphs || item.text || "Resultado devuelto por TJUE."),
      url
    };
  });
}

function textFrom(value) {
  if (Array.isArray(value)) return value.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" ").replace(/\s+/g, " ").trim();
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupeResults(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = r.ecli || r.roj || r.caseNumber || r.url || r.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function toComparisonRow(item) {
  return { source: item.source, date: item.date, court: item.court, identifier: item.identifier, ecli: item.ecli, roj: item.roj, summary: item.summary, url: item.url };
}

function inferSource(question) {
  const q = question.toLowerCase();
  if (q.includes("tjue") && (q.includes("supremo") || q.includes("nacional") || q.includes("españ"))) return "both";
  if (q.includes("tjue") || q.includes("unión europea") || q.includes("directiva 93/13")) return "tjue";
  return "cendoj";
}

function normalizeSource(source) {
  const s = String(source || "cendoj").toLowerCase();
  if (["tjue", "curia"].includes(s)) return "tjue";
  if (["both", "ambas", "all"].includes(s)) return "both";
  return "cendoj";
}

function sourceHumanLabel(source) {
  if (source === "tjue") return "TJUE";
  if (source === "both") return "CENDOJ + TJUE";
  return "CENDOJ";
}

function getUser(request, env) {
  const email =
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    request.headers.get("cf-access-authenticated-user-email") ||
    request.headers.get("X-LexRadar-User") ||
    request.headers.get("X-Forwarded-Email") ||
    env.DEV_USER_EMAIL ||
    "dev@lexradar.local";
  return { email: String(email).toLowerCase() };
}

async function ensureSchema(env) {
  if (!env.DB) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS quotas (user_email TEXT NOT NULL, week_key TEXT NOT NULL, searches_used INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (user_email, week_key))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS search_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT NOT NULL, query TEXT NOT NULL, source TEXT NOT NULL, result_count INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`).run();
}

async function getQuota(env, email) {
  const week = getWeekKey();
  const row = await env.DB.prepare("SELECT searches_used FROM quotas WHERE user_email = ? AND week_key = ?").bind(email, week).first();
  const used = Number(row?.searches_used || 0);
  return { limit: WEEKLY_LIMIT, used, remaining: Math.max(0, WEEKLY_LIMIT - used), week };
}

async function consumeQuota(env, email) {
  const week = getWeekKey();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO quotas (user_email, week_key, searches_used, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_email, week_key) DO UPDATE SET searches_used = searches_used + 1, updated_at = excluded.updated_at`).bind(email, week, now).run();
}

async function logSearch(env, email, query, source, count, status, createdAt) {
  await env.DB.prepare(`INSERT INTO search_logs (user_email, query, source, result_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(email, query, source, count, status, createdAt).run();
}

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function jsonResponse(request, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders(request) });
}

function corsResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-LexRadar-User",
    "Vary": "Origin"
  };
}
