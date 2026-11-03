import test from "node:test";
import assert from "node:assert/strict";

import { fetchDashboardData, validateDataset } from "../js/api.js";
import { summarize } from "../js/analysis.js";

/**
 * Teste de integração real. Requer internet.
 * Execute com: node --test tests/api.live.test.mjs
 */
test("consulta real às APIs do IBGE retorna e valida a tabela 4714", { timeout: 90000 }, async () => {
  const result = await fetchDashboardData({ useCache: false, useSnapshot: false });

  assert.equal(result.mode, "live");
  assert.equal(result.warning, null);
  assert.equal(result.states.length, 27);
  assert.equal(result.regions.length, 5);
  assert.equal(result.brazil.population, 203080756);
  assert.ok(["aggregates", "sidra"].includes(result.endpoint));
  assert.ok(
    result.queryUrls.states.includes("agregados/4714") ||
      result.queryUrls.states.includes("/t/4714/n3/all/v/93,6318,614/p/2022"),
  );

  const validation = validateDataset(result);
  assert.ok(validation.checks.every((check) => check.ok));
  assert.equal(validation.statesSum, result.brazil.population);
  assert.equal(validation.regionsSum, result.brazil.population);

  const summary = summarize(result.states, result.brazil.population);
  assert.equal(summary.count, 27);
  assert.equal(summary.most.name, "São Paulo");
  assert.equal(summary.least.name, "Roraima");
  assert.equal(summary.total, result.brazil.population);
});
