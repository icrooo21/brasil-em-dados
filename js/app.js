import {
  DATA_SOURCE,
  QUERY_URLS,
  fetchDashboardData,
} from "./api.js";
import {
  REGION_ORDER,
  buildAnalysis,
  computeLorenz,
  computeShares,
  formatDateTime,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatRatio,
  sortByPopulationDesc,
  summarize,
} from "./analysis.js";

const $ = (id) => document.getElementById(id);

const appState = {
  data: null,
  mode: "states",
  selectedStates: new Set(),
  selectedRegions: new Set(),
  selectionInitialized: false,
  charts: {},
  current: null,
  loading: false,
  chartAvailable: typeof window.Chart !== "undefined",
  printOpened: [],
  chartErrorNotified: false,
  fileProtocol: window.location.protocol === "file:",
};

const SHARE_COLORS = [
  "#0b2545",
  "#0f766e",
  "#14b8a6",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#64748b",
];

const compactFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function init() {
  bindEvents();
  configureChartDefaults();
  $("sourceQueryUrl").textContent = QUERY_URLS.states;
  $("sourceConsultedAt").textContent = "aguardando consulta";
  $("methodologyConsultedAt").textContent = "aguardando consulta";
  $("methodologyMode").textContent = "aguardando consulta";
  $("sourceMode").textContent = "aguardando consulta";
  $("footerConsultedAt").textContent = "aguardando consulta";
  document.body.classList.add("is-loading");
  loadData();
}

function configureChartDefaults() {
  if (!appState.chartAvailable) return;

  const fontFamily = getComputedStyle(document.body).fontFamily;
  window.Chart.defaults.font.family = fontFamily;
  window.Chart.defaults.font.size = 11;
  window.Chart.defaults.color = "#5c6f84";
  window.Chart.defaults.borderColor = "#e2e8f0";
  window.Chart.defaults.layout.padding = 2;
  window.Chart.defaults.plugins.legend.labels.boxWidth = 10;
  window.Chart.defaults.plugins.legend.labels.boxHeight = 10;
  window.Chart.defaults.plugins.legend.labels.usePointStyle = true;
  window.Chart.defaults.plugins.legend.labels.padding = 11;
  window.Chart.defaults.plugins.legend.labels.font = { size: 10, weight: "600" };
  window.Chart.defaults.animation.duration = prefersReducedMotion ? 0 : 500;
  window.Chart.defaults.animation.easing = "easeOutQuart";
}

function bindEvents() {
  $("refreshBtn").addEventListener("click", () => loadData({ refresh: true }));
  $("printBtn").addEventListener("click", printReport);
  $("printBtnBottom").addEventListener("click", printReport);

  $("modeStates").addEventListener("click", () => setMode("states"));
  $("modeRegions").addEventListener("click", () => setMode("regions"));

  $("regionQuickFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-region-quick]");
    if (!button) return;
    selectRegionQuick(button.dataset.regionQuick);
  });

  $("stateGroups").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-state-code]");
    if (!input) return;
    if (input.checked) {
      appState.selectedStates.add(input.dataset.stateCode);
    } else {
      appState.selectedStates.delete(input.dataset.stateCode);
    }
    updateQuickChips();
    renderDashboard();
  });

  $("regionOptions").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-region-code]");
    if (!input) return;
    if (input.checked) {
      appState.selectedRegions.add(input.dataset.regionCode);
    } else {
      appState.selectedRegions.delete(input.dataset.regionCode);
    }
    renderDashboard();
  });

  $("selectAllStates").addEventListener("click", () => {
    if (!appState.data) return;
    appState.selectedStates = new Set(
      appState.data.states.map((unit) => unit.code),
    );
    syncStateInputs();
    updateQuickChips();
    renderDashboard();
  });

  $("clearStates").addEventListener("click", () => {
    if (!appState.data) return;
    appState.selectedStates.clear();
    syncStateInputs();
    updateQuickChips();
    renderDashboard();
  });

  $("selectAllRegions").addEventListener("click", () => {
    if (!appState.data) return;
    appState.selectedRegions = new Set(
      appState.data.regions.map((unit) => unit.code),
    );
    syncRegionInputs();
    renderDashboard();
  });

  $("clearRegions").addEventListener("click", () => {
    if (!appState.data) return;
    appState.selectedRegions.clear();
    syncRegionInputs();
    renderDashboard();
  });

  window.addEventListener("beforeprint", openDetailsForPrint);
  window.addEventListener("afterprint", restoreDetailsAfterPrint);
}

async function loadData({ refresh = false } = {}) {
  if (appState.loading) return;

  appState.loading = true;
  setBusy(true);
  setStatus("loading");
  showLoadingNotice(refresh);

  try {
    const result = await fetchDashboardData();
    appState.data = result;
    initializeSelection(result);
    renderMeta(result);
    renderFilters(result);
    setModeUI();
    renderDashboard();
    setStatus(result.mode);
    renderNotices(result);
  } catch (error) {
    console.error("Falha ao carregar o painel:", error);
    setStatus("error");
    renderFatal(error);
  } finally {
    appState.loading = false;
    setBusy(false);
    document.body.classList.remove("is-loading");
  }
}

function initializeSelection(result) {
  const stateCodes = new Set(result.states.map((unit) => unit.code));
  const regionCodes = new Set(result.regions.map((unit) => unit.code));

  if (!appState.selectionInitialized) {
    appState.selectedStates = new Set(stateCodes);
    appState.selectedRegions = new Set(regionCodes);
    appState.selectionInitialized = true;
    return;
  }

  for (const code of appState.selectedStates) {
    if (!stateCodes.has(code)) appState.selectedStates.delete(code);
  }
  for (const code of appState.selectedRegions) {
    if (!regionCodes.has(code)) appState.selectedRegions.delete(code);
  }
}

function setBusy(busy) {
  $("kpiGrid").setAttribute("aria-busy", String(busy));
  $("refreshBtn").disabled = busy;
  $("refreshLabel").textContent = busy ? "Atualizando…" : "Atualizar dados";
  document.body.classList.toggle("is-loading", busy && !appState.data);
}

function setStatus(mode) {
  const labels = {
    live: "Dados ao vivo",
    cache: "Cache local",
    snapshot: "Snapshot incorporado",
    loading: "Consultando a API",
    error: "Falha na consulta",
  };
  $("dataStatus").dataset.mode = mode;
  $("dataStatusText").textContent = labels[mode] || "Status desconhecido";
}

function showLoadingNotice(refresh) {
  const notice = createNotice({
    type: "info",
    title: refresh ? "Atualizando dados oficiais" : "Consultando as APIs do IBGE",
    message: refresh
      ? "Nova requisição à API em andamento. Os valores atuais permanecem visíveis até a conclusão."
      : "Carregando população, área territorial e densidade demográfica da tabela 4714.",
  });
  $("notices").replaceChildren(notice);
}

function renderNotices(result) {
  const notices = [];

  if (result.mode === "live") {
    notices.push(
      createNotice({
        type: "success",
        title: "Dados oficiais carregados e validados",
        message: `Consulta real à ${result.endpointLabel || "API do SIDRA/IBGE"} concluída em ${formatDateTime(
          result.fetchedAt,
        )}. A validação confirmou 27 UFs, 5 regiões e soma igual ao total do Brasil (${formatInteger(
          result.brazil.population,
        )} pessoas).`,
      }),
    );
  } else {
    notices.push(
      createNotice({
        type: "warning",
        title: result.warning.title,
        message: result.warning.message,
        details: [
          result.warning.failureTitle &&
            `${result.warning.failureTitle}. ${result.warning.details?.[0] || ""}`,
          ...(result.warning.details || []).slice(1),
        ].filter(Boolean),
        retry: true,
      }),
    );
  }

  if (appState.fileProtocol) {
    notices.push(
      createNotice({
        type: "info",
        title: "Arquivo aberto diretamente (file://)",
        message:
          "Navegadores podem bloquear módulos e requisições nesse modo. Para execução local confiável, use node server.mjs e acesse http://localhost:8000.",
      }),
    );
  }

  $("notices").replaceChildren(...notices);
}

function renderFatal(error) {
  $("lastConsulted").textContent = "Consulta sem sucesso";
  $("sourceConsultedAt").textContent = "sem sucesso";
  $("methodologyConsultedAt").textContent = "sem sucesso";
  $("methodologyMode").textContent = "Erro";
  $("sourceMode").textContent = "Erro";
  $("footerConsultedAt").textContent = "—";
  $("sourceQueryUrl").textContent = QUERY_URLS.states;
  $("universeStates").textContent = "—";
  $("universeRegions").textContent = "—";
  $("universeBrazil").textContent = "—";

  const details =
    error?.details?.length > 0
      ? error.details
      : [error?.message || "Erro desconhecido."];

  const notice = createNotice({
    type: "error",
    title: "Não foi possível carregar os dados oficiais",
    message:
      "A API, o cache local e o snapshot incorporado não forneceram dados válidos. Nenhum valor foi inventado ou substituído. Verifique a conexão e tente novamente.",
    details,
    retry: true,
  });
  $("notices").replaceChildren(notice);

  resetDashboard(
    "Não foi possível carregar os dados oficiais. Consulte o aviso acima e tente novamente.",
  );
  $("analysisHeadline").textContent = "Não foi possível gerar a análise";
  $("analysisSubhead").textContent =
    "Sem dados validados, o painel não produz conclusões.";
  renderList("observations", [], "Nenhum dado disponível.");
  renderList("comparisons", [], "Nenhuma comparação disponível.");
  renderList(
    "limitations",
    [
      "A consulta falhou e não havia cache ou snapshot válido para exibição.",
      "Nenhum valor fictício foi apresentado.",
    ],
  );
  $("filterSummary").textContent = "Sem dados";
  $("kpiGrid").setAttribute("aria-busy", "false");
}

function createNotice({ type, title, message, details = [], retry = false }) {
  const notice = document.createElement("div");
  notice.className = `notice notice-${type}`;

  const icon = document.createElement("span");
  icon.className = "notice-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent =
    type === "success" ? "✓" : type === "warning" || type === "error" ? "!" : "i";

  const body = document.createElement("div");

  const strong = document.createElement("strong");
  strong.textContent = title;
  body.append(strong);

  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  body.append(paragraph);

  if (details.length) {
    const detail = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Detalhes técnicos";
    detail.append(summary);
    for (const item of details) {
      const line = document.createElement("p");
      line.textContent = item;
      detail.append(line);
    }
    body.append(detail);
  }

  if (retry) {
    const actions = document.createElement("div");
    actions.className = "notice-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "notice-btn";
    button.textContent = "Tentar novamente";
    button.addEventListener("click", () => loadData({ refresh: true }));
    actions.append(button);
    body.append(actions);
  }

  notice.append(icon, body);
  return notice;
}

function renderMeta(result) {
  const consulted = formatDateTime(result.fetchedAt);
  const modeLabel =
    result.mode === "live"
      ? "Ao vivo"
      : result.mode === "cache"
        ? "Cache local"
        : "Snapshot incorporado";

  $("lastConsulted").textContent =
    result.mode === "live"
      ? consulted
      : `${consulted} · ${modeLabel.toLowerCase()}`;
  $("sourceConsultedAt").textContent = consulted;
  $("methodologyConsultedAt").textContent = consulted;
  $("methodologyMode").textContent = modeLabel;
  $("sourceMode").textContent =
    result.mode === "live" && result.endpointLabel
      ? `${modeLabel} · ${result.endpointLabel}`
      : modeLabel;
  $("footerConsultedAt").textContent = consulted;
  $("sourceQueryUrl").textContent = result.queryUrls?.states || QUERY_URLS.states;

  $("universeStates").textContent = String(result.states.length);
  $("universeRegions").textContent = String(result.regions.length);
  $("universeYear").textContent = String(DATA_SOURCE.referenceYear);
  $("universeBrazil").textContent = formatInteger(result.brazil.population);

  $("printFooter").textContent = `Relatório gerado em ${formatDateTime(
    new Date().toISOString(),
  )}. Dados oficiais consultados em ${consulted}. Resultados observados pertencem ao IBGE; cálculos e interpretações são deste painel.`;
}

function renderFilters(result) {
  $("modeStates").querySelector(".mode-count").textContent = String(
    result.states.length,
  );
  $("modeRegions").querySelector(".mode-count").textContent = String(
    result.regions.length,
  );

  const groups = $("stateGroups");
  groups.replaceChildren();

  for (const region of REGION_ORDER) {
    const units = result.states
      .filter((unit) => unit.region === region)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (!units.length) continue;

    const group = document.createElement("section");
    group.className = "state-group";

    const title = document.createElement("h3");
    title.className = "state-group-title";
    title.append(document.createTextNode(region));
    const count = document.createElement("span");
    count.textContent = String(units.length);
    title.append(count);

    const options = document.createElement("div");
    options.className = "state-options";

    for (const unit of units) {
      const label = document.createElement("label");
      label.className = "check-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = unit.code;
      input.dataset.stateCode = unit.code;
      input.checked = appState.selectedStates.has(unit.code);
      input.setAttribute("aria-label", `Incluir ${unit.name} na análise`);

      const name = document.createElement("span");
      name.textContent = unit.name;

      label.append(input, name);
      options.append(label);
    }

    group.append(title, options);
    groups.append(group);
  }

  const regionOptions = $("regionOptions");
  regionOptions.replaceChildren();
  const sortedRegions = [...result.regions].sort(
    (a, b) => REGION_ORDER.indexOf(a.name) - REGION_ORDER.indexOf(b.name),
  );

  for (const region of sortedRegions) {
    const label = document.createElement("label");
    label.className = "region-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = region.code;
    input.dataset.regionCode = region.code;
    input.checked = appState.selectedRegions.has(region.code);
    input.setAttribute("aria-label", `Incluir a região ${region.name} na análise`);

    const name = document.createElement("span");
    name.className = "region-name";
    name.textContent = region.name;

    const population = document.createElement("span");
    population.className = "region-pop";
    population.textContent = `${formatInteger(region.population)} pessoas`;

    const share = document.createElement("span");
    share.className = "region-share";
    share.textContent = `${formatPercent(
      (region.population / result.brazil.population) * 100,
    )} do Brasil`;

    label.append(input, name, population, share);
    regionOptions.append(label);
  }

  syncStateInputs();
  syncRegionInputs();
  updateQuickChips();
  renderFilterSummary();
}

function syncStateInputs() {
  document.querySelectorAll("input[data-state-code]").forEach((input) => {
    input.checked = appState.selectedStates.has(input.dataset.stateCode);
  });
}

function syncRegionInputs() {
  document.querySelectorAll("input[data-region-code]").forEach((input) => {
    input.checked = appState.selectedRegions.has(input.dataset.regionCode);
  });
}

function selectRegionQuick(region) {
  if (!appState.data) return;
  if (region === "all") {
    appState.selectedStates = new Set(
      appState.data.states.map((unit) => unit.code),
    );
  } else {
    appState.selectedStates = new Set(
      appState.data.states
        .filter((unit) => unit.region === region)
        .map((unit) => unit.code),
    );
  }
  syncStateInputs();
  updateQuickChips();
  renderDashboard();
}

function updateQuickChips() {
  const states = appState.data?.states || [];
  const selected = appState.selectedStates;

  document.querySelectorAll("[data-region-quick]").forEach((button) => {
    const value = button.dataset.regionQuick;
    let active = false;

    if (value === "all") {
      active = states.length > 0 && selected.size === states.length;
    } else {
      const codes = states
        .filter((unit) => unit.region === value)
        .map((unit) => unit.code);
      active =
        codes.length > 0 &&
        selected.size === codes.length &&
        codes.every((code) => selected.has(code));
    }

    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setMode(mode) {
  if (appState.mode === mode) return;
  appState.mode = mode;
  setModeUI();
  renderDashboard();
}

function setModeUI() {
  const statesMode = appState.mode === "states";
  $("modeStates").classList.toggle("is-active", statesMode);
  $("modeRegions").classList.toggle("is-active", !statesMode);
  $("modeStates").setAttribute("aria-pressed", String(statesMode));
  $("modeRegions").setAttribute("aria-pressed", String(!statesMode));
  $("stateFilters").hidden = !statesMode;
  $("regionFilters").hidden = statesMode;
}

function getSelectedUnits() {
  if (!appState.data) return [];
  return appState.mode === "regions"
    ? appState.data.regions.filter((unit) =>
        appState.selectedRegions.has(unit.code),
      )
    : appState.data.states.filter((unit) =>
        appState.selectedStates.has(unit.code),
      );
}

function unitLabel(plural = false) {
  if (appState.mode === "regions") return plural ? "regiões" : "região";
  return plural ? "UFs" : "UF";
}

function renderDashboard() {
  if (!appState.data) return;

  const units = getSelectedUnits();
  const summary = summarize(units, appState.data.brazil.population);
  const analysis = buildAnalysis({
    units,
    summary,
    mode: appState.mode,
    brazilPopulation: appState.data.brazil.population,
    dataMode: appState.data.mode,
    dataFetchedAt: appState.data.fetchedAt,
  });

  appState.current = {
    units: summary?.units || sortByPopulationDesc(units),
    summary,
    analysis,
  };

  renderKPIs(summary, units);
  renderCharts(summary, units);
  renderAnalysis(analysis);
  renderFilterSummary();
}

function renderKPIs(summary, units) {
  if (!summary) {
    $("kpiTotal").textContent = "—";
    $("kpiTotalNote").textContent = "Nenhuma unidade selecionada";
    $("kpiMost").textContent = "—";
    $("kpiMostNote").textContent = "Selecione ao menos uma unidade";
    $("kpiLeast").textContent = "—";
    $("kpiLeastNote").textContent = "Selecione ao menos uma unidade";
    $("kpiCount").textContent = "0";
    $("kpiCountUnit").textContent = unitLabel(true);
    $("kpiCountNote").textContent = "Nenhuma unidade no recorte";
    $("insightStrip").hidden = true;
    return;
  }

  const totalSource =
    appState.mode === "regions"
      ? appState.data.regions.length
      : appState.data.states.length;
  const isFullSet =
    summary.count === totalSource &&
    summary.shareOfBrazil !== null &&
    Math.abs(summary.shareOfBrazil - 100) < 1e-9;
  const representedRegions = new Set(
    units.map((unit) => unit.region).filter(Boolean),
  ).size;

  $("kpiTotal").textContent = formatInteger(summary.total);
  $("kpiTotalNote").textContent = isFullSet
    ? `Soma das ${summary.count} ${unitLabel(true)} = total do Brasil (${formatPercent(
        summary.shareOfBrazil,
      )}). Checagem de consistência, não estimativa independente.`
    : `${formatPercent(summary.shareOfBrazil)} do total do Brasil · soma das unidades selecionadas.`;

  $("kpiMost").textContent = summary.most.name;
  $("kpiMostNote").textContent = `${formatInteger(
    summary.most.population,
  )} pessoas · ${formatPercent(summary.mostShare)} do recorte`;

  $("kpiLeast").textContent = summary.least.name;
  $("kpiLeastNote").textContent = `${formatInteger(
    summary.least.population,
  )} pessoas · ${formatPercent(summary.leastShare)} do recorte`;

  $("kpiCount").textContent = String(summary.count);
  $("kpiCountUnit").textContent = unitLabel(true);
  $("kpiCountNote").textContent =
    appState.mode === "regions"
      ? `${summary.count} de 5 grandes regiões oficiais`
      : `${summary.count} ${unitLabel(true)} · ${representedRegions} de 5 regiões representadas`;

  if (summary.count >= 2) {
    $("insightStrip").hidden = false;
    $("insightRange").textContent = `${formatInteger(summary.range)} pessoas`;
    $("insightRatio").textContent = formatRatio(summary.ratio);
    $("insightTop3").textContent = formatPercent(summary.top3Share);
  } else {
    $("insightStrip").hidden = true;
  }
}

function renderCharts(summary, units) {
  if (!summary || !summary.units.length) {
    destroyAllCharts();
    $("chartsGrid").hidden = true;
    $("chartsEmpty").hidden = false;
    $("chartsEmptyText").textContent =
      "Selecione pelo menos uma unidade territorial nos filtros para gerar os gráficos.";
    clearAllTables();
    resetChartNotes();
    return;
  }

  $("chartsGrid").hidden = false;
  $("chartsEmpty").hidden = true;

  const sorted = summary.units;
  const densitySorted = [...units].sort((a, b) => b.density - a.density);

  renderPopulationChart(sorted, summary);
  renderShareChart(sorted, summary);
  renderDensityChart(densitySorted);
  renderLorenzChart(sorted, summary);

  renderPopulationTable(sorted, summary);
  renderShareTable(sorted, summary);
  renderDensityTable(densitySorted);
  renderLorenzTable(summary);
}

function prepareChartHeight(wrapId, count) {
  const wrap = $(wrapId);
  const rowHeight = appState.mode === "regions" ? 46 : 25;
  wrap.style.height = `${Math.max(320, count * rowHeight + 92)}px`;
}

function renderPopulationChart(sorted, summary) {
  prepareChartHeight("populationChartWrap", sorted.length);
  showCanvas("population");

  const colors = sorted.map((_, index) =>
    index === 0 ? "#0d9488" : "#1b4a73",
  );

  const chart = createChart("population", {
    type: "bar",
    data: {
      labels: sorted.map((unit) => unit.name),
      datasets: [
        {
          label: "População residente",
          data: sorted.map((unit) => unit.population),
          backgroundColor: colors,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: appState.mode === "regions" ? 38 : 18,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#061a30",
          titleFont: { size: 12, weight: "600" },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => `${formatInteger(context.parsed.x)} pessoas`,
            afterLabel: (context) =>
              `${formatPercent(
                (sorted[context.dataIndex].population / summary.total) * 100,
              )} do recorte`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "#e8eef5" },
          border: { display: false },
          ticks: {
            maxTicksLimit: 6,
            callback: (value) => compactPopulation(value),
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            autoSkip: false,
            font: { size: sorted.length > 20 ? 9.5 : 11 },
          },
        },
      },
    },
  });

  if (chart) {
    const canvas = $("populationChart");
    canvas.setAttribute(
      "aria-label",
      `Gráfico de barras horizontais da população residente em 2022. ` +
        `${summary.most.name} é a maior unidade, com ${formatInteger(
          summary.most.population,
        )} pessoas; ${summary.least.name} é a menor, com ${formatInteger(
          summary.least.population,
        )}. Total do recorte: ${formatInteger(summary.total)} pessoas.`,
    );
  }

  $("populationNote").textContent = `${sorted.length} ${unitLabel(
    true,
  )} · ordenado da maior para a menor`;
}

function renderShareChart(sorted, summary) {
  showCanvas("share");
  const shares = computeShares(sorted);
  const maxSlices = 8;
  let items = shares;
  let grouped = false;
  let topCount = 0;
  let restCount = 0;

  if (shares.length > maxSlices) {
    topCount = maxSlices - 1;
    const rest = shares.slice(topCount);
    restCount = rest.length;
    const restPopulation = rest.reduce(
      (sum, unit) => sum + unit.population,
      0,
    );
    items = [
      ...shares.slice(0, topCount),
      {
        code: "__others",
        name: `Demais (${rest.length} ${unitLabel(true)})`,
        population: restPopulation,
        share: (restPopulation / summary.total) * 100,
        isGroup: true,
      },
    ];
    grouped = true;
  }

  const colors = items.map((unit, index) =>
    unit.isGroup ? "#94a3b8" : SHARE_COLORS[index % SHARE_COLORS.length],
  );

  const chart = createChart("share", {
    type: "doughnut",
    data: {
      labels: items.map((unit) => unit.name),
      datasets: [
        {
          data: items.map((unit) => unit.population),
          backgroundColor: colors,
          borderColor: "#ffffff",
          borderWidth: 2,
          hoverOffset: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            padding: 10,
            font: { size: 9.5 },
          },
        },
        tooltip: {
          backgroundColor: "#061a30",
          titleFont: { size: 12, weight: "600" },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const item = items[context.dataIndex];
              return `${formatInteger(item.population)} pessoas · ${formatPercent(
                item.share,
              )}`;
            },
          },
        },
      },
    },
    plugins: [doughnutCenterText],
  });

  if (chart) {
    const canvas = $("shareChart");
    canvas.setAttribute(
      "aria-label",
      `Gráfico de rosca com a distribuição percentual de ${formatInteger(
        summary.total,
      )} pessoas entre ${summary.count} ${unitLabel(
        true,
      )}. A maior participação é de ${summary.most.name}, com ${formatPercent(
        summary.mostShare,
      )}.`,
    );
  }

  $("shareNote").textContent = grouped
    ? `Top ${topCount} + ${restCount} demais agrupadas`
    : `Todas as ${items.length} unidades exibidas`;
}

function renderDensityChart(sorted) {
  prepareChartHeight("densityChartWrap", sorted.length);
  showCanvas("density");

  const maxDensity = sorted[0]?.density || 1;
  const logMax = Math.max(10, 10 ** Math.ceil(Math.log10(maxDensity)));
  const colors = sorted.map((_, index) =>
    index === 0 ? "#0f766e" : "#14b8a6",
  );

  const chart = createChart("density", {
    type: "bar",
    data: {
      labels: sorted.map((unit) => unit.name),
      datasets: [
        {
          label: "Densidade demográfica",
          data: sorted.map((unit) => unit.density),
          backgroundColor: colors,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: appState.mode === "regions" ? 38 : 18,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#061a30",
          titleFont: { size: 12, weight: "600" },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) =>
              `${formatDecimal(context.parsed.x)} hab/km²`,
            afterLabel: (context) => {
              const unit = sorted[context.dataIndex];
              return `${formatInteger(unit.population)} pessoas · ${formatInteger(
                unit.areaKm2,
              )} km²`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "logarithmic",
          min: 1,
          max: logMax,
          grid: { color: "#e8eef5" },
          border: { display: false },
          title: {
            display: true,
            text: "Habitantes por km² (escala logarítmica)",
            color: "#708399",
            font: { size: 10, weight: "600" },
          },
          ticks: {
            maxTicksLimit: 6,
            callback: (value) => compactDensity(value),
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            autoSkip: false,
            font: { size: sorted.length > 20 ? 9.5 : 11 },
          },
        },
      },
    },
  });

  if (chart) {
    const canvas = $("densityChart");
    const max = sorted[0];
    const min = sorted[sorted.length - 1];
    canvas.setAttribute(
      "aria-label",
      `Gráfico de barras da densidade demográfica em escala logarítmica. ` +
        `A maior densidade é ${max.name}, com ${formatDecimal(
          max.density,
        )} habitantes por quilômetro quadrado; a menor é ${min.name}, com ${formatDecimal(
          min.density,
        )}.`,
    );
  }

  $("densityNote").textContent =
    sorted.length > 1
      ? `Maior: ${sorted[0].name} (${formatDecimal(
          sorted[0].density,
        )}) · escala logarítmica`
      : `Escala logarítmica · ${formatDecimal(sorted[0].density)} hab/km²`;
}

function renderLorenzChart(sorted, summary) {
  const canvas = $("lorenzChart");
  const empty = $("lorenzEmpty");

  if (sorted.length < 2) {
    destroyChart("lorenz");
    canvas.hidden = true;
    empty.hidden = false;
    empty.textContent =
      "A curva de Lorenz requer pelo menos duas unidades. Selecione mais unidades para calcular a concentração.";
    $("lorenzNote").textContent = "Gini indisponível com uma unidade";
    $("lorenzTableBody").replaceChildren();
    $("lorenzTableCount").textContent = "0 linhas";
    return;
  }

  canvas.hidden = false;
  empty.hidden = true;

  const lorenz = computeLorenz(sorted);
  const points = lorenz.points.map((point) => ({
    x: point.x * 100,
    y: point.y * 100,
  }));

  const chart = createChart("lorenz", {
    type: "line",
    data: {
      datasets: [
        {
          label: "Curva de Lorenz",
          data: points,
          borderColor: "#0d9488",
          backgroundColor: "rgba(20, 184, 166, 0.13)",
          borderWidth: 2.5,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          pointBackgroundColor: "#0f766e",
          tension: 0,
          fill: "origin",
        },
        {
          label: "Igualdade perfeita",
          data: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
          borderColor: "#94a3b8",
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { size: 10 } },
        },
        tooltip: {
          backgroundColor: "#061a30",
          titleFont: { size: 12, weight: "600" },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (context) =>
              context[0]?.dataset.label === "Igualdade perfeita"
                ? "Referência"
                : `${formatPercent(context[0]?.parsed.x || 0)} das unidades`,
            label: (context) =>
              context.dataset.label === "Igualdade perfeita"
                ? "Distribuição perfeitamente igual"
                : `${formatPercent(context.parsed.y)} da população acumulada`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: 100,
          grid: { color: "#e8eef5" },
          border: { display: false },
          title: {
            display: true,
            text: "Unidades acumuladas (%)",
            color: "#708399",
            font: { size: 10, weight: "600" },
          },
          ticks: {
            callback: (value) => `${value}%`,
            maxTicksLimit: 6,
          },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: "#e8eef5" },
          border: { display: false },
          title: {
            display: true,
            text: "População acumulada (%)",
            color: "#708399",
            font: { size: 10, weight: "600" },
          },
          ticks: {
            callback: (value) => `${value}%`,
            maxTicksLimit: 6,
          },
        },
      },
    },
  });

  if (chart) {
    canvas.setAttribute(
      "aria-label",
      `Curva de Lorenz da concentração populacional entre ${sorted.length} unidades. ` +
        `Índice de Gini: ${formatDecimal(
          lorenz.gini,
        )}, em escala de 0 a 1. A linha tracejada representa igualdade perfeita.`,
    );
  }

  $("lorenzNote").textContent = `Gini: ${formatDecimal(
    lorenz.gini,
  )} · ${sorted.length} ${unitLabel(true)}`;
}

const doughnutCenterText = {
  id: "doughnutCenterText",
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    const fontFamily = getComputedStyle(document.body).fontFamily;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0b2545";
    ctx.font = `800 ${Math.min(30, chartArea.width / 8)}px ${fontFamily}`;
    ctx.fillText("100%", x, y - 8);
    ctx.fillStyle = "#5c6f84";
    ctx.font = `600 11px ${fontFamily}`;
    ctx.fillText("do recorte", x, y + 16);
    ctx.restore();
  },
};

function createChart(key, config) {
  destroyChart(key);
  if (!appState.chartAvailable) {
    showChartUnavailable(key);
    return null;
  }

  const canvas = $(`${key}Chart`);
  try {
    const chart = new window.Chart(canvas, config);
    appState.charts[key] = chart;
    return chart;
  } catch (error) {
    console.error(`Falha ao desenhar o gráfico ${key}:`, error);
    showChartUnavailable(key);
    if (!appState.chartErrorNotified) {
      appState.chartErrorNotified = true;
      const notice = createNotice({
        type: "error",
        title: "Chart.js não pôde desenhar os gráficos",
        message:
          "Os indicadores e as tabelas continuam disponíveis. Verifique se vendor/chart.umd.min.js foi carregado corretamente.",
        details: [error.message],
      });
      $("notices").append(notice);
    }
    return null;
  }
}

function destroyChart(key) {
  if (appState.charts[key]) {
    appState.charts[key].destroy();
    delete appState.charts[key];
  }
}

function destroyAllCharts() {
  for (const key of Object.keys(appState.charts)) {
    destroyChart(key);
  }
}

function showCanvas(key) {
  const canvas = $(`${key}Chart`);
  const empty = $(`${key}Empty`);
  canvas.hidden = false;
  if (empty) empty.hidden = true;
}

function showChartUnavailable(key) {
  const canvas = $(`${key}Chart`);
  const empty = $(`${key}Empty`);
  if (canvas) canvas.hidden = true;
  if (empty) {
    empty.hidden = false;
    empty.textContent =
      "Gráfico indisponível. A tabela de dados e os indicadores continuam acessíveis.";
  }
}

function renderPopulationTable(sorted, summary) {
  const tbody = $("populationTableBody");
  tbody.replaceChildren();
  const table = tbody.closest("table");
  table.classList.toggle("hide-region-col", appState.mode === "regions");

  sorted.forEach((unit, index) => {
    addTableRow(tbody, [
      { text: String(index + 1), className: "rank" },
      { text: unit.name },
      { text: unit.region || "—", className: "region-col" },
      { text: formatInteger(unit.population), className: "num" },
      {
        text: formatPercent((unit.population / summary.total) * 100),
        className: "num",
      },
    ]);
  });
  $("populationTableCount").textContent = `${sorted.length} linhas`;
}

function renderShareTable(sorted, summary) {
  const tbody = $("shareTableBody");
  tbody.replaceChildren();
  const shares = computeShares(sorted);

  shares.forEach((unit) => {
    addTableRow(tbody, [
      { text: unit.name },
      { text: formatInteger(unit.population), className: "num" },
      { text: formatPercent(unit.share), className: "num" },
    ]);
  });
  $("shareTableCount").textContent = `${shares.length} linhas`;
}

function renderDensityTable(sorted) {
  const tbody = $("densityTableBody");
  tbody.replaceChildren();

  sorted.forEach((unit, index) => {
    addTableRow(tbody, [
      { text: String(index + 1), className: "rank" },
      { text: unit.name },
      { text: formatDecimal(unit.density), className: "num" },
      { text: formatInteger(unit.areaKm2), className: "num" },
    ]);
  });
  $("densityTableCount").textContent = `${sorted.length} linhas`;
}

function renderLorenzTable(summary) {
  const tbody = $("lorenzTableBody");
  tbody.replaceChildren();

  if (!summary || summary.count < 2) {
    $("lorenzTableCount").textContent = "0 linhas";
    return;
  }

  const lorenz = computeLorenz(summary.units);
  lorenz.units.forEach((unit, index) => {
    const point = lorenz.points[index + 1];
    addTableRow(tbody, [
      { text: unit.name },
      { text: formatPercent(point.x * 100), className: "num" },
      { text: formatPercent(point.y * 100), className: "num" },
    ]);
  });
  $("lorenzTableCount").textContent = `${lorenz.units.length} linhas`;
}

function addTableRow(tbody, cells) {
  const row = document.createElement("tr");
  for (const cell of cells) {
    const td = document.createElement("td");
    td.textContent = cell.text;
    if (cell.className) td.className = cell.className;
    row.append(td);
  }
  tbody.append(row);
}

function clearAllTables() {
  for (const id of [
    "populationTableBody",
    "shareTableBody",
    "densityTableBody",
    "lorenzTableBody",
  ]) {
    $(id).replaceChildren();
  }
  for (const id of [
    "populationTableCount",
    "shareTableCount",
    "densityTableCount",
    "lorenzTableCount",
  ]) {
    $(id).textContent = "0 linhas";
  }
}

function resetChartNotes() {
  $("populationNote").textContent = "Sem dados";
  $("shareNote").textContent = "Sem dados";
  $("densityNote").textContent = "Sem dados";
  $("lorenzNote").textContent = "Sem dados";
}

function renderAnalysis(analysis) {
  $("analysisHeadline").textContent = analysis.headline;
  $("analysisSubhead").textContent = analysis.subhead;
  renderList("observations", analysis.observations, "Sem observações no recorte.");
  renderList("comparisons", analysis.comparisons, "Sem comparações no recorte.");
  renderList("limitations", analysis.limitations, "Sem limitações registradas.");
}

function renderList(id, items, fallback) {
  const list = $(id);
  list.replaceChildren();

  if (!items.length) {
    const item = document.createElement("li");
    item.textContent = fallback;
    list.append(item);
    return;
  }

  for (const text of items) {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  }
}

function renderFilterSummary() {
  if (!appState.data) {
    $("filterSummary").textContent = "Carregando…";
    return;
  }

  const selectedUnits = getSelectedUnits();
  const totalUnits =
    appState.mode === "regions"
      ? appState.data.regions.length
      : appState.data.states.length;

  if (!selectedUnits.length) {
    $("filterSummary").textContent = `Nenhuma ${unitLabel()} selecionada`;
    return;
  }

  const totalPopulation = selectedUnits.reduce(
    (sum, unit) => sum + unit.population,
    0,
  );
  const share = (totalPopulation / appState.data.brazil.population) * 100;
  $("filterSummary").textContent = `${selectedUnits.length} de ${totalUnits} ${unitLabel(
    true,
  )} · ${formatPercent(share)} do Brasil`;
}

function resetDashboard(message) {
  destroyAllCharts();
  $("chartsGrid").hidden = true;
  $("chartsEmpty").hidden = false;
  $("chartsEmptyText").textContent = message;
  clearAllTables();
  resetChartNotes();

  $("kpiTotal").textContent = "—";
  $("kpiTotalNote").textContent = "Sem dados";
  $("kpiMost").textContent = "—";
  $("kpiMostNote").textContent = "Sem dados";
  $("kpiLeast").textContent = "—";
  $("kpiLeastNote").textContent = "Sem dados";
  $("kpiCount").textContent = "0";
  $("kpiCountUnit").textContent = unitLabel(true);
  $("kpiCountNote").textContent = "Sem dados";
  $("insightStrip").hidden = true;

  $("analysisHeadline").textContent = "Sem dados para analisar";
  $("analysisSubhead").textContent = message;
  renderList("observations", [], "Nenhuma observação disponível.");
  renderList("comparisons", [], "Nenhuma comparação disponível.");
  renderList("limitations", [], "Nenhuma limitação registrada.");
}

function compactPopulation(value) {
  if (!Number.isFinite(value)) return "";
  if (value >= 1e9) return `${compactFormatter.format(value / 1e9)} bi`;
  if (value >= 1e6) return `${compactFormatter.format(value / 1e6)} mi`;
  if (value >= 1e3) return `${compactFormatter.format(value / 1e3)} mil`;
  return formatInteger(value);
}

function compactDensity(value) {
  if (!Number.isFinite(value)) return "";
  if (value >= 1000) return `${compactFormatter.format(value / 1000)} mil`;
  return formatInteger(value);
}

function openDetailsForPrint() {
  appState.printOpened = [];
  document.querySelectorAll("details").forEach((detail) => {
    if (!detail.open) {
      detail.open = true;
      appState.printOpened.push(detail);
    }
  });
}

function restoreDetailsAfterPrint() {
  for (const detail of appState.printOpened) {
    detail.open = false;
  }
  appState.printOpened = [];
}

function printReport() {
  openDetailsForPrint();
  window.setTimeout(() => window.print(), 80);
}

init();
