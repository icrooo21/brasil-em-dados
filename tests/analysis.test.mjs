import test from "node:test";
import assert from "node:assert/strict";

import { FALLBACK_SNAPSHOT } from "../js/fallback-data.js";
import {
  buildAnalysis,
  computeLorenz,
  computeShares,
  formatPercent,
  formatRatio,
  summarize,
} from "../js/analysis.js";
import {
  ApiError,
  DataValidationError,
  parseAggregatesResponse,
  parseSidraResponse,
  validateDataset,
} from "../js/api.js";

const states = FALLBACK_SNAPSHOT.states;
const regions = FALLBACK_SNAPSHOT.regions;
const brazil = FALLBACK_SNAPSHOT.brazil;

test("snapshot validado: 27 UFs e 5 regiões somam o total do Brasil", () => {
  const result = validateDataset({ states, regions, brazil });
  assert.equal(result.statesSum, 203080756);
  assert.equal(result.regionsSum, 203080756);
  assert.equal(result.brazilPopulation, 203080756);
  assert.ok(result.checks.every((check) => check.ok));
});

test("resumo de todas as UFs calcula maior, menor, amplitude e mediana", () => {
  const summary = summarize(states, brazil.population);
  assert.equal(summary.count, 27);
  assert.equal(summary.total, 203080756);
  assert.equal(summary.most.name, "São Paulo");
  assert.equal(summary.least.name, "Roraima");
  assert.equal(summary.most.population, 44411238);
  assert.equal(summary.least.population, 636707);
  assert.equal(summary.range, 43774531);
  assert.equal(summary.median, 3941613);
  assert.ok(Math.abs(summary.ratio - 69.75145239490064) < 1e-9);
  assert.ok(Math.abs(summary.top3Share - 39.8887627737608) < 1e-9);
  assert.equal(formatPercent(summary.shareOfBrazil), "100,0%");
  assert.equal(formatRatio(summary.ratio), "69,8×");
});

test("participações percentuais somam 100% dentro do erro de ponto flutuante", () => {
  const shares = computeShares(states);
  const total = shares.reduce((sum, unit) => sum + unit.share, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.equal(shares[0].name, "São Paulo");
});

test("resumo das regiões usa os totais oficiais e não duplica as UFs", () => {
  const summary = summarize(regions, brazil.population);
  assert.equal(summary.count, 5);
  assert.equal(summary.total, 203080756);
  assert.equal(summary.most.name, "Sudeste");
  assert.equal(summary.least.name, "Centro-Oeste");
  assert.equal(formatPercent(summary.shareOfBrazil), "100,0%");
});

test("filtro do Sudeste recalcula total e participação no Brasil", () => {
  const sudeste = states.filter((unit) => unit.region === "Sudeste");
  const summary = summarize(sudeste, brazil.population);
  assert.equal(summary.count, 4);
  assert.equal(summary.total, 84840113);
  assert.equal(summary.most.name, "São Paulo");
  assert.equal(summary.least.name, "Espírito Santo");
  assert.ok(Math.abs(summary.shareOfBrazil - 41.77653987067095) < 1e-9);
});

test("curva de Lorenz é monotônica e o Gini fica entre 0 e 1", () => {
  const lorenz = computeLorenz(states);
  assert.equal(lorenz.points[0].x, 0);
  assert.equal(lorenz.points[0].y, 0);
  assert.equal(lorenz.points.at(-1).x, 1);
  assert.equal(lorenz.points.at(-1).y, 1);
  for (let index = 1; index < lorenz.points.length; index += 1) {
    assert.ok(lorenz.points[index].x >= lorenz.points[index - 1].x);
    assert.ok(lorenz.points[index].y >= lorenz.points[index - 1].y);
  }
  assert.ok(Math.abs(lorenz.gini - 0.5101457259874672) < 1e-9);
});

test("uma única unidade não gera comparação inválida", () => {
  const unit = states.filter((state) => state.code === "35");
  const summary = summarize(unit, brazil.population);
  assert.equal(summary.range, 0);
  assert.equal(summary.ratio, 1);
  assert.equal(summary.top3Share, 100);
  assert.equal(computeLorenz(unit).gini, 0);
  const analysis = buildAnalysis({
    units: unit,
    summary,
    mode: "states",
    brazilPopulation: brazil.population,
    dataMode: "live",
  });
  assert.match(analysis.comparisons[0], /apenas uma UF selecionada/);
});

test("conclusões dinâmicas citam os dados do recorte e não afirmam crescimento", () => {
  const summary = summarize(states, brazil.population);
  const analysis = buildAnalysis({
    units: states,
    summary,
    mode: "states",
    brazilPopulation: brazil.population,
    dataMode: "snapshot",
    dataFetchedAt: FALLBACK_SNAPSHOT.fetchedAt,
  });

  assert.match(analysis.headline, /São Paulo/);
  assert.match(analysis.subhead, /39,9%/);
  assert.ok(analysis.observations.some((text) => text.includes("Roraima")));
  assert.ok(analysis.observations.some((text) => text.includes("203.080.756")));
  assert.ok(analysis.limitations.some((text) => text.includes("snapshot")));
  assert.ok(analysis.limitations.some((text) => text.includes("único ano")));
  assert.doesNotMatch(analysis.observations.join(" "), /cresceu|aumentou|diminuiu|causou/i);
  assert.doesNotMatch(analysis.comparisons.join(" "), /cresceu|aumentou|diminuiu|causou/i);
});

test("recorte vazio retorna estado de ausência de dados", () => {
  assert.equal(summarize([], brazil.population), null);
  const analysis = buildAnalysis({
    units: [],
    summary: null,
    mode: "states",
    brazilPopulation: brazil.population,
  });
  assert.match(analysis.headline, /Nenhuma unidade selecionada/);
  assert.equal(analysis.observations.length, 0);
});

test("parser do SIDRA converte valores e descarta ausentes", () => {
  const header = {
    NC: "Nível Territorial (Código)",
    NN: "Nível Territorial",
    MC: "Unidade de Medida (Código)",
    MN: "Unidade de Medida",
    V: "Valor",
    D1C: "Unidade da Federação (Código)",
    D1N: "Unidade da Federação",
    D2C: "Variável (Código)",
    D2N: "Variável",
    D3C: "Ano (Código)",
    D3N: "Ano",
  };
  const payload = [
    header,
    { NC: "3", D1C: "11", D1N: "Rondônia", D2C: "93", V: "1581196", D3C: "2022" },
    { NC: "3", D1C: "11", D1N: "Rondônia", D2C: "6318", V: "237754.172", D3C: "2022" },
    { NC: "3", D1C: "11", D1N: "Rondônia", D2C: "614", V: "6.65", D3C: "2022" },
    { NC: "3", D1C: "12", D1N: "Acre", D2C: "93", V: "830018", D3C: "2022" },
    { NC: "3", D1C: "12", D1N: "Acre", D2C: "6318", V: "...", D3C: "2022" },
    { NC: "3", D1C: "12", D1N: "Acre", D2C: "614", V: "5.06", D3C: "2022" },
  ];

  const parsed = parseSidraResponse(payload, "n3");
  assert.equal(parsed.units.length, 1);
  assert.equal(parsed.units[0].name, "Rondônia");
  assert.equal(parsed.units[0].population, 1581196);
  assert.equal(parsed.units[0].areaKm2, 237754.172);
  assert.equal(parsed.units[0].density, 6.65);
  assert.equal(parsed.rejectedUnits, 1);
});

test("parser da API de Agregados v3 combina as três variáveis por UF", () => {
  const seriesFor = (values) =>
    Object.entries(values).map(([code, value]) => ({
      localidade: {
        id: code,
        nivel: { id: "N3", nome: "Unidade da Federação" },
        nome: code === "11" ? "Rondônia" : "Acre",
      },
      serie: { 2022: value },
    }));

  const payload = [
    { id: "93", variavel: "População residente", resultados: [{ classificacoes: [], series: seriesFor({ 11: "1581196", 12: "830018" }) }] },
    { id: "6318", variavel: "Área da unidade territorial", resultados: [{ classificacoes: [], series: seriesFor({ 11: "237754.172", 12: "164173.429" }) }] },
    { id: "614", variavel: "Densidade demográfica", resultados: [{ classificacoes: [], series: seriesFor({ 11: "6.65", 12: "5.06" }) }] },
  ];

  const parsed = parseAggregatesResponse(payload, "n3");
  assert.equal(parsed.units.length, 2);
  assert.deepEqual(parsed.seenVariables.sort(), ["614", "6318", "93"]);

  const rondonia = parsed.units.find((unit) => unit.code === "11");
  assert.equal(rondonia.name, "Rondônia");
  assert.equal(rondonia.population, 1581196);
  assert.equal(rondonia.areaKm2, 237754.172);
  assert.equal(rondonia.density, 6.65);

  assert.throws(
    () => parseAggregatesResponse(payload.slice(0, 2), "n3"),
    (error) => error instanceof ApiError && /variáveis esperadas/.test(error.message),
  );
});

test("validação rejeita soma incompatível com o Brasil", () => {
  const badStates = states.map((unit, index) =>
    index === 0 ? { ...unit, population: unit.population + 1 } : unit,
  );
  assert.throws(
    () => validateDataset({ states: badStates, regions, brazil }),
    DataValidationError,
  );
});
