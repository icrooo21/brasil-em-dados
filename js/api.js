import { FALLBACK_SNAPSHOT } from "./fallback-data.js";

export const DATA_SOURCE = Object.freeze({
  name: "SIDRA/IBGE",
  table: "4714",
  tableName: "População residente, área territorial e densidade demográfica",
  research: "Censo Demográfico",
  referenceYear: 2022,
  variables: Object.freeze({
    population: "93",
    area: "6318",
    density: "614",
  }),
  apiUrl: "https://servicodados.ibge.gov.br/api/v3/agregados/4714",
  apiSecondaryUrl: "https://apisidra.ibge.gov.br/",
  tableUrl: "https://sidra.ibge.gov.br/tabela/4714",
  ibgeUrl: "https://www.ibge.gov.br/",
  censusUrl: "https://censo2022.ibge.gov.br/",
});

const AGGREGATES_BASE = "https://servicodados.ibge.gov.br/api/v3/agregados";
const API_BASE = "https://apisidra.ibge.gov.br/values";
const CACHE_KEY = "brasil-em-dados:tabela-4714:v1";
const CACHE_SCHEMA = 1;
const REQUEST_TIMEOUT_MS = 20000;

const STATE_REGION = Object.freeze({
  "11": "Norte",
  "12": "Norte",
  "13": "Norte",
  "14": "Norte",
  "15": "Norte",
  "16": "Norte",
  "17": "Norte",
  "21": "Nordeste",
  "22": "Nordeste",
  "23": "Nordeste",
  "24": "Nordeste",
  "25": "Nordeste",
  "26": "Nordeste",
  "27": "Nordeste",
  "28": "Nordeste",
  "29": "Nordeste",
  "31": "Sudeste",
  "32": "Sudeste",
  "33": "Sudeste",
  "35": "Sudeste",
  "41": "Sul",
  "42": "Sul",
  "43": "Sul",
  "50": "Centro-Oeste",
  "51": "Centro-Oeste",
  "52": "Centro-Oeste",
  "53": "Centro-Oeste",
});

const LEVEL_CODES = Object.freeze({
  n1: "1",
  n2: "2",
  n3: "3",
});

export class ApiError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ApiError";
    this.details = details;
  }
}

export class DataValidationError extends Error {
  constructor(message, failures = [], checks = []) {
    super(message);
    this.name = "DataValidationError";
    this.failures = failures;
    this.checks = checks;
  }
}

export function buildQueryUrl(level) {
  const variables = Object.values(DATA_SOURCE.variables).join(",");
  return `${API_BASE}/t/${DATA_SOURCE.table}/${level}/all/v/${variables}/p/${DATA_SOURCE.referenceYear}?formato=json`;
}

export function buildAggregatesUrl(level) {
  const variables = Object.values(DATA_SOURCE.variables).join("|");
  return `${AGGREGATES_BASE}/${DATA_SOURCE.table}/periodos/${DATA_SOURCE.referenceYear}/variaveis/${variables}?localidades=N${LEVEL_CODES[level]}[all]`;
}

export const QUERY_URLS = Object.freeze({
  states: buildAggregatesUrl("n3"),
  regions: buildAggregatesUrl("n2"),
  brazil: buildAggregatesUrl("n1"),
});

export const SECONDARY_QUERY_URLS = Object.freeze({
  states: buildQueryUrl("n3"),
  regions: buildQueryUrl("n2"),
  brazil: buildQueryUrl("n1"),
});

function parseNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text || ["-", "--", "...", "..", "X", "x"].includes(text)) return null;

  const normalized = text.includes(",") && !text.includes(".")
    ? text.replace(",", ".")
    : text;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Converte a resposta da API de Agregados v3 (servicodados.ibge.gov.br)
 * em unidades territoriais. Cada variável vem em um bloco próprio.
 */
export function parseAggregatesResponse(payload, level) {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new ApiError("A API retornou uma estrutura inesperada (lista vazia).");
  }

  const expectedLevel = `N${LEVEL_CODES[level]}`;
  const expectedVariables = Object.values(DATA_SOURCE.variables);
  const map = new Map();
  const seenVariables = new Set();
  let skippedRows = 0;
  let unexpectedPeriod = false;
  let unexpectedLevel = false;

  for (const variableBlock of payload) {
    if (!variableBlock || typeof variableBlock !== "object") {
      skippedRows += 1;
      continue;
    }

    const variable = String(variableBlock.id ?? "");
    if (!expectedVariables.includes(variable)) continue;
    seenVariables.add(variable);

    const results = Array.isArray(variableBlock.resultados)
      ? variableBlock.resultados
      : [];
    if (!results.length) {
      skippedRows += 1;
      continue;
    }

    for (const result of results) {
      if (Array.isArray(result?.classificacoes) && result.classificacoes.length) {
        continue;
      }
      const series = Array.isArray(result?.series) ? result.series : [];

      for (const entry of series) {
        const location = entry?.localidade;
        const code = String(location?.id ?? "").trim();
        const name = String(location?.nome ?? "").trim();
        if (!code || !name) {
          skippedRows += 1;
          continue;
        }
        if (String(location?.nivel?.id) !== expectedLevel) {
          unexpectedLevel = true;
          continue;
        }

        const values = entry?.serie ?? {};
        const periodKey = String(DATA_SOURCE.referenceYear);
        if (!(periodKey in values)) {
          unexpectedPeriod = true;
          continue;
        }

        if (!map.has(code)) {
          map.set(code, {
            code,
            name,
            population: null,
            areaKm2: null,
            density: null,
          });
        }

        const value = parseNumeric(values[periodKey]);
        if (value === null) {
          skippedRows += 1;
          continue;
        }

        const unit = map.get(code);
        if (variable === DATA_SOURCE.variables.population) unit.population = value;
        if (variable === DATA_SOURCE.variables.area) unit.areaKm2 = value;
        if (variable === DATA_SOURCE.variables.density) unit.density = value;
      }
    }
  }

  if (unexpectedPeriod) {
    throw new ApiError(
      `A API retornou um período diferente de ${DATA_SOURCE.referenceYear}.`,
    );
  }
  if (unexpectedLevel) {
    throw new ApiError(`A API retornou um nível territorial diferente de ${level}.`);
  }

  const missingVariables = expectedVariables.filter(
    (variable) => !seenVariables.has(variable),
  );
  if (missingVariables.length) {
    throw new ApiError(
      `A resposta não contém todas as variáveis esperadas (faltam: ${missingVariables.join(
        ", ",
      )}).`,
    );
  }

  const units = [...map.values()].filter(
    (unit) =>
      Number.isFinite(unit.population) &&
      unit.population > 0 &&
      Number.isFinite(unit.areaKm2) &&
      unit.areaKm2 > 0 &&
      Number.isFinite(unit.density) &&
      unit.density > 0,
  );
  const incomplete = map.size - units.length;

  if (!units.length) {
    throw new ApiError("Nenhuma unidade territorial válida foi encontrada na resposta.");
  }

  return {
    units,
    skippedRows: skippedRows + incomplete,
    rejectedUnits: incomplete,
    seenVariables: [...seenVariables],
  };
}

/**
 * Converte a resposta bruta do SIDRA em unidades territoriais.
 * Valores ausentes ("-", "...", "X") são descartados, nunca tratados como zero.
 */
export function parseSidraResponse(payload, level) {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new ApiError("A API retornou uma estrutura inesperada (lista vazia).");
  }

  const header = payload[0];
  if (
    !header ||
    typeof header !== "object" ||
    !("NC" in header) ||
    !("D1C" in header) ||
    !("D2C" in header)
  ) {
    throw new ApiError("O cabeçalho da resposta não corresponde ao contrato do SIDRA.");
  }

  const expectedLevelCode = LEVEL_CODES[level];
  const map = new Map();
  const seenVariables = new Set();
  let skippedRows = 0;
  let unexpectedPeriod = false;
  let unexpectedLevel = false;

  for (const row of payload.slice(1)) {
    if (!row || typeof row !== "object") {
      skippedRows += 1;
      continue;
    }
    if (String(row.D3C) !== String(DATA_SOURCE.referenceYear)) {
      unexpectedPeriod = true;
      continue;
    }
    if (String(row.NC) !== expectedLevelCode) {
      unexpectedLevel = true;
      continue;
    }

    const code = String(row.D1C ?? "").trim();
    const name = String(row.D1N ?? "").trim();
    if (!code || !name) {
      skippedRows += 1;
      continue;
    }

    if (!map.has(code)) {
      map.set(code, {
        code,
        name,
        population: null,
        areaKm2: null,
        density: null,
      });
    }

    const variable = String(row.D2C ?? "");
    seenVariables.add(variable);
    const value = parseNumeric(row.V);
    if (value === null) {
      skippedRows += 1;
      continue;
    }

    const unit = map.get(code);
    if (variable === DATA_SOURCE.variables.population) unit.population = value;
    if (variable === DATA_SOURCE.variables.area) unit.areaKm2 = value;
    if (variable === DATA_SOURCE.variables.density) unit.density = value;
  }

  if (unexpectedPeriod) {
    throw new ApiError(
      `A API retornou um período diferente de ${DATA_SOURCE.referenceYear}.`,
    );
  }
  if (unexpectedLevel) {
    throw new ApiError(`A API retornou um nível territorial diferente de ${level}.`);
  }

  const requiredVariables = Object.values(DATA_SOURCE.variables);
  const missingVariables = requiredVariables.filter(
    (variable) => !seenVariables.has(variable),
  );
  if (missingVariables.length) {
    throw new ApiError(
      `A resposta não contém todas as variáveis esperadas (faltam: ${missingVariables.join(
        ", ",
      )}).`,
    );
  }

  const units = [...map.values()].filter(
    (unit) =>
      Number.isFinite(unit.population) &&
      unit.population > 0 &&
      Number.isFinite(unit.areaKm2) &&
      unit.areaKm2 > 0 &&
      Number.isFinite(unit.density) &&
      unit.density > 0,
  );
  const incomplete = map.size - units.length;

  if (!units.length) {
    throw new ApiError("Nenhuma unidade territorial válida foi encontrada na resposta.");
  }

  return {
    units,
    skippedRows: skippedRows + incomplete,
    rejectedUnits: incomplete,
    seenVariables: [...seenVariables],
  };
}

function attachRegions(states) {
  return states.map((state) => {
    const region = STATE_REGION[state.code];
    if (!region) {
      throw new DataValidationError(
        `A UF de código ${state.code} não possui mapeamento regional conhecido.`,
      );
    }
    return { ...state, region };
  });
}

/**
 * Confere contagens, unicidade, somas e coerência densidade = população / área.
 * Lança DataValidationError se algum teste essencial falhar.
 */
export function validateDataset({ states, regions, brazil }) {
  const checks = [];
  const failures = [];
  let maxDensityDeviation = 0;

  const assert = (name, condition, detail) => {
    checks.push({ name, ok: Boolean(condition), detail: detail || "" });
    if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
  };

  assert("27 unidades da Federação", states.length === 27, `recebidas: ${states.length}`);
  assert("5 grandes regiões", regions.length === 5, `recebidas: ${regions.length}`);
  assert("Total do Brasil presente", Boolean(brazil), "registro ausente");
  if (!brazil) {
    throw new DataValidationError("O total do Brasil não foi retornado.", failures, checks);
  }

  assert(
    "Códigos de UF únicos",
    new Set(states.map((unit) => unit.code)).size === states.length,
    "há códigos repetidos",
  );
  assert(
    "Códigos de região únicos",
    new Set(regions.map((unit) => unit.code)).size === regions.length,
    "há códigos repetidos",
  );

  const invalidStates = states.filter(
    (unit) =>
      !Number.isFinite(unit.population) ||
      unit.population <= 0 ||
      !Number.isInteger(unit.population) ||
      !Number.isFinite(unit.areaKm2) ||
      unit.areaKm2 <= 0 ||
      !Number.isFinite(unit.density) ||
      unit.density <= 0 ||
      !unit.region,
  );
  assert(
    "Valores positivos e completos nas UFs",
    invalidStates.length === 0,
    invalidStates.map((unit) => unit.name).join(", "),
  );

  const invalidRegions = regions.filter(
    (unit) =>
      !Number.isFinite(unit.population) ||
      unit.population <= 0 ||
      !Number.isInteger(unit.population) ||
      !Number.isFinite(unit.areaKm2) ||
      unit.areaKm2 <= 0 ||
      !Number.isFinite(unit.density) ||
      unit.density <= 0,
  );
  assert(
    "Valores positivos e completos nas regiões",
    invalidRegions.length === 0,
    invalidRegions.map((unit) => unit.name).join(", "),
  );

  for (const unit of [...states, ...regions, brazil]) {
    const expectedDensity = unit.population / unit.areaKm2;
    const deviation = Math.abs(unit.density - expectedDensity);
    const relativeDeviation = expectedDensity > 0 ? deviation / expectedDensity : 1;
    maxDensityDeviation = Math.max(maxDensityDeviation, relativeDeviation);
  }
  assert(
    "Coerência densidade = população / área",
    maxDensityDeviation <= 0.01,
    `maior desvio relativo: ${(maxDensityDeviation * 100).toFixed(2)}%`,
  );

  const statesSum = states.reduce((sum, unit) => sum + unit.population, 0);
  const regionsSum = regions.reduce((sum, unit) => sum + unit.population, 0);
  assert(
    "Soma das UFs igual ao total do Brasil",
    statesSum === brazil.population,
    `soma ${statesSum}; Brasil ${brazil.population}`,
  );
  assert(
    "Soma das regiões igual ao total do Brasil",
    regionsSum === brazil.population,
    `soma ${regionsSum}; Brasil ${brazil.population}`,
  );

  const statesArea = states.reduce((sum, unit) => sum + unit.areaKm2, 0);
  const areaDeviation = Math.abs(statesArea - brazil.areaKm2) / brazil.areaKm2;
  assert(
    "Soma das áreas das UFs compatível com o Brasil",
    areaDeviation <= 0.001,
    `desvio relativo de ${(areaDeviation * 100).toFixed(3)}%`,
  );

  if (failures.length) {
    throw new DataValidationError(
      "Os dados recebidos não passaram na validação de consistência.",
      failures,
      checks,
    );
  }

  return {
    checks,
    maxDensityDeviation,
    statesSum,
    regionsSum,
    brazilPopulation: brazil.population,
  };
}

async function fetchAggregatesLevel(level) {
  const url = buildAggregatesUrl(level);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new ApiError(
        `A API respondeu com HTTP ${response.status}.`,
        [`URL: ${url}`],
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!text.trim()) {
      throw new ApiError("A API retornou uma resposta vazia.");
    }
    if (/text\/html/i.test(contentType) || /^\s*</.test(text)) {
      throw new ApiError(
        "A API retornou HTML em vez de JSON. Isso pode indicar bloqueio ou indisponibilidade temporária.",
      );
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError("A resposta da API não é um JSON válido.");
    }

    return { ...parseAggregatesResponse(payload, level), url, contentType };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError(
        `A consulta excedeu ${REQUEST_TIMEOUT_MS / 1000} segundos.`,
        [`URL: ${url}`],
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSidraLevel(level) {
  const url = buildQueryUrl(level);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new ApiError(
        `A API respondeu com HTTP ${response.status}.`,
        [`URL: ${url}`],
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!text.trim()) {
      throw new ApiError("A API retornou uma resposta vazia.");
    }
    if (/text\/html/i.test(contentType) || /^\s*</.test(text)) {
      throw new ApiError(
        "A API retornou HTML em vez de JSON. Isso pode indicar bloqueio ou indisponibilidade temporária.",
      );
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError("A resposta da API não é um JSON válido.");
    }

    return { ...parseSidraResponse(payload, level), url, contentType };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError(
        `A consulta excedeu ${REQUEST_TIMEOUT_MS / 1000} segundos.`,
        [`URL: ${url}`],
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { fetchSidraLevel };

function readCache() {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached?.schema !== CACHE_SCHEMA || !cached?.data) return null;

    const data = cached.data;
    validateDataset(data);
    return {
      states: data.states,
      regions: data.regions,
      brazil: data.brazil,
      fetchedAt: cached.fetchedAt,
      cacheSavedAt: cached.savedAt,
      queryUrls: cached.queryUrls || QUERY_URLS,
    };
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // O armazenamento pode estar bloqueado; o snapshot continua disponível.
    }
    return null;
  }
}

function saveCache(result) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        schema: CACHE_SCHEMA,
        savedAt: new Date().toISOString(),
        fetchedAt: result.fetchedAt,
        data: {
          states: result.states,
          regions: result.regions,
          brazil: result.brazil,
        },
        queryUrls: result.queryUrls,
      }),
    );
  } catch {
    // Cache é opcional; a ausência dele não invalida a consulta ao vivo.
  }
}

function snapshotResult() {
  const snapshot = JSON.parse(JSON.stringify(FALLBACK_SNAPSHOT));
  const data = {
    states: snapshot.states,
    regions: snapshot.regions,
    brazil: snapshot.brazil,
  };
  const validation = validateDataset(data);
  return {
    ...data,
    fetchedAt: snapshot.fetchedAt,
    source: DATA_SOURCE,
    endpoint: "sidra",
    endpointLabel: "API SIDRA (/values)",
    queryUrls: {
      ...QUERY_URLS,
      states: snapshot.sourceUrl || QUERY_URLS.states,
    },
    validation,
  };
}

function describeError(error) {
  if (error instanceof DataValidationError) {
    return {
      title: "Dados recebidos não passaram na validação",
      message: error.message,
      details: error.failures,
    };
  }
  if (error instanceof ApiError) {
    return {
      title: "Falha na consulta à API",
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof TypeError) {
    return {
      title: "Falha de conexão com a API",
      message:
        "Não foi possível acessar o SIDRA/IBGE. Verifique a conexão e, se o arquivo foi aberto diretamente, execute por um servidor HTTP local.",
      details: [error.message],
    };
  }
  return {
    title: "Erro inesperado ao consultar os dados",
    message: error?.message || "Erro desconhecido.",
    details: [],
  };
}

const consultedAtFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

function consultedAtLabel(isoDate) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? "data indisponível"
    : `${consultedAtFormatter.format(date)} (Brasília)`;
}

function cacheAgeLabel(fetchedAt) {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "";
  const days = Math.floor(ageMs / 86400000);
  if (days >= 1) return ` O cache tem ${days} dia${days === 1 ? "" : "s"}.`;
  const hours = Math.floor(ageMs / 3600000);
  if (hours >= 1) return ` O cache tem ${hours} hora${hours === 1 ? "" : "s"}.`;
  return "";
}

const API_ENDPOINTS = Object.freeze({
  aggregates: {
    key: "aggregates",
    label: "API de Agregados v3 do IBGE",
    urls: QUERY_URLS,
  },
  sidra: {
    key: "sidra",
    label: "API SIDRA (/values)",
    urls: SECONDARY_QUERY_URLS,
  },
});

async function fetchLiveFrom(fetcher, endpoint) {
  const [statesResult, regionsResult, brazilResult] = await Promise.all([
    fetcher("n3"),
    fetcher("n2"),
    fetcher("n1"),
  ]);

  const states = attachRegions(statesResult.units);
  const regions = regionsResult.units;
  const brazil = brazilResult.units[0];
  const validation = validateDataset({ states, regions, brazil });

  return {
    mode: "live",
    fetchedAt: new Date().toISOString(),
    states,
    regions,
    brazil,
    source: DATA_SOURCE,
    endpoint: endpoint.key,
    endpointLabel: endpoint.label,
    queryUrls: endpoint.urls,
    validation,
    skipped: {
      states: statesResult.skippedRows,
      regions: regionsResult.skippedRows,
      brazil: brazilResult.skippedRows,
    },
    warning: null,
  };
}

/**
 * Consulta os três níveis territoriais na API de Agregados v3 e, se ela
 * falhar, tenta a API SIDRA (/values). Depois usa cache local e snapshot,
 * sempre com aviso explícito do modo em uso.
 */
export async function fetchDashboardData({ useCache = true, useSnapshot = true } = {}) {
  const failures = [];
  let liveResult = null;

  for (const [fetcher, endpoint] of [
    [fetchAggregatesLevel, API_ENDPOINTS.aggregates],
    [fetchSidraLevel, API_ENDPOINTS.sidra],
  ]) {
    try {
      liveResult = await fetchLiveFrom(fetcher, endpoint);
      break;
    } catch (error) {
      failures.push({
        endpoint: endpoint.label,
        ...describeError(error),
      });
    }
  }

  if (liveResult) {
    saveCache(liveResult);
    return liveResult;
  }

  const failureDetails = failures.flatMap((failure) => [
    `${failure.endpoint} — ${failure.title}: ${failure.message}`,
    ...(failure.details || []),
  ]);
  const failureTitle = "Falha nas consultas às APIs do IBGE";

  if (useCache) {
    const cached = readCache();
    if (cached) {
      return {
        mode: "cache",
        ...cached,
        source: DATA_SOURCE,
        validation: validateDataset(cached),
        warning: {
          title: "API indisponível — exibindo cache local",
          message: `Os dados abaixo foram consultados em ${consultedAtLabel(
            cached.fetchedAt,
          )} e ficaram salvos neste navegador.${cacheAgeLabel(
            cached.fetchedAt,
          )} Não são uma consulta ao vivo.`,
          details: failureDetails,
          failureTitle,
        },
      };
    }
  }

  if (useSnapshot) {
    try {
      const snapshot = snapshotResult();
      return {
        ...snapshot,
        mode: "snapshot",
        warning: {
          title: "API e cache indisponíveis — exibindo snapshot incorporado",
          message: `O painel está usando um snapshot de consulta real ao SIDRA, gravado em ${consultedAtLabel(
            snapshot.fetchedAt,
          )}. Não é uma consulta ao vivo.`,
          details: failureDetails,
          failureTitle,
        },
      };
    } catch (snapshotError) {
      throw new ApiError(
        "A API, o cache local e o snapshot incorporado não produziram dados válidos.",
        [...failureDetails, snapshotError.message],
      );
    }
  }

  throw new ApiError("As APIs do IBGE não responderam.", failureDetails);
}
