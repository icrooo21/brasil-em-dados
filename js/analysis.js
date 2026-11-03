/**
 * Cálculos puros do painel. Nenhuma função aqui depende do DOM.
 * Todas as entradas vêm da tabela 4714 do SIDRA/IBGE (Censo 2022).
 */

export const REGION_ORDER = Object.freeze([
  "Norte",
  "Nordeste",
  "Sudeste",
  "Sul",
  "Centro-Oeste",
]);

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const ratioFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

export function formatInteger(value) {
  return Number.isFinite(value) ? integerFormatter.format(value) : "—";
}

export function formatDecimal(value) {
  return Number.isFinite(value) ? decimalFormatter.format(value) : "—";
}

export function formatPercentValue(value) {
  return Number.isFinite(value) ? percentFormatter.format(value) : "—";
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${percentFormatter.format(value)}%` : "—";
}

export function formatRatio(value) {
  return Number.isFinite(value) ? `${ratioFormatter.format(value)}×` : "—";
}

export function formatDateTime(isoDate) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? "data indisponível"
    : `${dateTimeFormatter.format(date)} (Brasília)`;
}

export function sortByPopulationDesc(units) {
  return [...units].sort((a, b) => b.population - a.population);
}

export function computeMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Resumo do recorte ativo.
 * @param {Array<{code:string,name:string,population:number,areaKm2:number,density:number,region?:string}>} units
 * @param {number|null} brazilPopulation total oficial do Brasil na mesma tabela
 */
export function summarize(units, brazilPopulation = null) {
  if (!Array.isArray(units) || units.length === 0) return null;

  const sorted = sortByPopulationDesc(units);
  const total = sorted.reduce((sum, unit) => sum + unit.population, 0);
  const most = sorted[0];
  const least = sorted[sorted.length - 1];
  const top3Population = sorted
    .slice(0, 3)
    .reduce((sum, unit) => sum + unit.population, 0);
  const bottom3Population = sorted
    .slice(-3)
    .reduce((sum, unit) => sum + unit.population, 0);
  const densitySorted = [...units].sort((a, b) => b.density - a.density);
  const densityMax = densitySorted[0];
  const densityMin = densitySorted[densitySorted.length - 1];

  return {
    units: sorted,
    count: sorted.length,
    total,
    most,
    least,
    range: most.population - least.population,
    ratio: least.population > 0 ? most.population / least.population : null,
    mean: total / sorted.length,
    median: computeMedian(sorted.map((unit) => unit.population)),
    mostShare: (most.population / total) * 100,
    leastShare: (least.population / total) * 100,
    top3Share: (top3Population / total) * 100,
    bottom3Share: (bottom3Population / total) * 100,
    top3Population,
    bottom3Population,
    shareOfBrazil:
      Number.isFinite(brazilPopulation) && brazilPopulation > 0
        ? (total / brazilPopulation) * 100
        : null,
    density: {
      max: densityMax,
      min: densityMin,
      median: computeMedian(units.map((unit) => unit.density)),
      ratio:
        densityMin.density > 0 ? densityMax.density / densityMin.density : null,
    },
  };
}

export function computeShares(units) {
  const total = units.reduce((sum, unit) => sum + unit.population, 0);
  return sortByPopulationDesc(units).map((unit) => ({
    ...unit,
    share: total > 0 ? (unit.population / total) * 100 : 0,
  }));
}

/**
 * Curva de Lorenz e índice de Gini dos totais populacionais entre as unidades.
 * Não mede desigualdade de renda nem entre indivíduos.
 */
export function computeLorenz(units) {
  if (!Array.isArray(units) || units.length === 0) return null;

  const sorted = [...units].sort((a, b) => a.population - b.population);
  const total = sorted.reduce((sum, unit) => sum + unit.population, 0);
  if (total <= 0) return null;

  const points = [{ x: 0, y: 0 }];
  let cumulative = 0;
  sorted.forEach((unit, index) => {
    cumulative += unit.population;
    points.push({
      x: (index + 1) / sorted.length,
      y: cumulative / total,
    });
  });

  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const width = points[index].x - points[index - 1].x;
    const height = points[index].y + points[index - 1].y;
    area += (width * height) / 2;
  }

  return {
    points,
    gini: Math.min(1, Math.max(0, 1 - 2 * area)),
    units: sorted,
    total,
  };
}

/**
 * Produz a leitura analítica do recorte. Cada frase usa apenas valores
 * calculados a partir das unidades recebidas.
 */
export function buildAnalysis({
  units,
  summary,
  mode = "states",
  brazilPopulation = null,
  dataMode = "live",
  dataFetchedAt = null,
}) {
  if (!summary || !units.length) {
    return {
      headline: "Nenhuma unidade selecionada",
      subhead:
        "Escolha ao menos uma unidade territorial nos filtros para gerar indicadores, gráficos e conclusões.",
      observations: [],
      comparisons: [],
      limitations: [
        "Sem unidades no recorte, não há dados para calcular totais, participações ou diferenças.",
      ],
    };
  }

  const isRegionMode = mode === "regions";
  const unitWord = isRegionMode ? "região" : "UF";
  const unitPlural = isRegionMode ? "regiões" : "UFs";
  const fullSetSize = isRegionMode ? 5 : 27;
  const isFullSet = summary.count === fullSetSize;
  const lorenz = computeLorenz(units);
  const most = summary.most;
  const least = summary.least;
  const density = summary.density;
  const dateLabel = dataFetchedAt ? formatDateTime(dataFetchedAt) : null;

  const observations = [];
  if (isFullSet && Number.isFinite(summary.shareOfBrazil)) {
    observations.push(
      `A soma das ${summary.count} ${unitPlural} é de ${formatInteger(
        summary.total,
      )} pessoas e corresponde a ${formatPercent(
        summary.shareOfBrazil,
      )} do total do Brasil na tabela 4714 (${formatInteger(
        brazilPopulation,
      )} pessoas). A igualdade entre os dois valores é uma checagem de consistência territorial, não uma estimativa independente.`,
    );
  } else {
    observations.push(
      `O recorte reúne ${formatInteger(summary.total)} pessoas em ${
        summary.count
      } ${summary.count === 1 ? unitWord : unitPlural}, o equivalente a ${formatPercent(
        summary.shareOfBrazil,
      )} do total do Brasil na tabela 4714 (${formatInteger(
        brazilPopulation,
      )} pessoas).`,
    );
  }

  if (summary.count === 1) {
    observations.push(
      `${most.name} é a única ${unitWord} do recorte, com ${formatInteger(
        most.population,
      )} pessoas (100,0% do total selecionado).`,
    );
  } else {
    observations.push(
      `${most.name} é a ${unitWord} mais populosa do recorte, com ${formatInteger(
        most.population,
      )} pessoas (${formatPercent(summary.mostShare)} do total selecionado).`,
    );
    observations.push(
      `${least.name} é a ${unitWord} menos populosa, com ${formatInteger(
        least.population,
      )} pessoas (${formatPercent(summary.leastShare)} do total selecionado).`,
    );
    observations.push(
      `A mediana do recorte é de ${formatInteger(
        summary.median,
      )} pessoas; a média é de ${formatInteger(
        summary.mean,
      )} pessoas. A mediana é o valor central da distribuição ordenada e é menos sensível a valores extremos do que a média.`,
    );
  }

  if (summary.count > 1 && density.max && density.min) {
    observations.push(
      `A maior densidade demográfica é a de ${
        density.max.name
      }, com ${formatDecimal(
        density.max.density,
      )} hab/km²; a menor é a de ${
        density.min.name
      }, com ${formatDecimal(
        density.min.density,
      )} hab/km². Densidade é a razão entre população e área territorial, não um indicador de volume populacional.`,
    );
  }

  const comparisons = [];
  if (summary.count > 1) {
    comparisons.push(
      `A amplitude do recorte é de ${formatInteger(
        summary.range,
      )} pessoas: é a diferença entre ${most.name} e ${least.name}. Em termos relativos, ${most.name} tem ${formatRatio(
        summary.ratio,
      )} a população de ${least.name}.`,
    );
    comparisons.push(
      `As três maiores ${unitPlural} reúnem ${formatPercent(
        summary.top3Share,
      )} da população selecionada; as três menores somam ${formatPercent(
        summary.bottom3Share,
      )}.`,
    );
    if (lorenz) {
      comparisons.push(
        `O índice de Gini de concentração entre as ${summary.count} ${unitPlural} é ${formatDecimal(
          lorenz.gini,
        )}, em uma escala em que 0 significa totais populacionais iguais e 1 significa toda a população em uma única unidade. Esse índice descreve a distribuição entre as unidades, não entre pessoas.`,
      );
    }
    comparisons.push(
      `Cada ponto percentual do recorte equivale a ${formatInteger(
        summary.total / 100,
      )} pessoas.`,
    );
    if (density.max && density.min && density.max.name !== density.min.name) {
      comparisons.push(
        `A densidade varia ${formatRatio(
          density.ratio,
        )} entre ${density.max.name} e ${density.min.name}. População absoluta e densidade respondem a perguntas diferentes: volume total versus concentração no território.`,
      );
    }
    if (most.name !== density.max.name) {
      comparisons.push(
        `${most.name} lidera em população absoluta, enquanto ${
          density.max.name
        } lidera em densidade. Isso mostra que as duas medidas não são intercambiáveis; o painel não infere causalidade entre elas.`,
      );
    }
  } else {
    comparisons.push(
      `Com apenas uma ${unitWord} selecionada, não há comparação entre territórios. Selecione mais unidades para calcular amplitude, razão e concentração.`,
    );
  }

  const limitations = [
    "Os dados têm um único ano de referência (2022). O painel não mede crescimento, redução, migração ou tendências ao longo do tempo.",
    "O indicador é população residente, conforme a tabela 4714; não equivale a população presente, eleitorado ou estimativas populacionais de outros anos.",
    "A soma exibida é um agregado das unidades selecionadas. Fora do conjunto completo, ela não representa o total nacional.",
    "Percentuais podem não somar exatamente 100,0% por arredondamento na apresentação.",
    "O Gini e a curva de Lorenz medem concentração dos totais populacionais entre as unidades, não desigualdade entre pessoas, renda ou acesso a serviços.",
    "Não há inferência causal entre população, densidade e características econômicas ou sociais.",
    "Comparações com outras edições do Censo exigem compatibilização territorial e metodológica.",
  ];

  if (dataMode !== "live" && dateLabel) {
    limitations.unshift(
      `Os dados exibidos vêm de ${
        dataMode === "cache" ? "cache local" : "snapshot incorporado"
      } consultado em ${dateLabel}; não são uma consulta ao vivo.`,
    );
  }

  return {
    headline:
      summary.count === 1
        ? `${most.name} é a única ${unitWord} do recorte, com ${formatInteger(
            most.population,
          )} pessoas.`
        : isRegionMode
          ? `${most.name} lidera o recorte regional, com ${formatPercent(
              summary.mostShare,
            )} da população selecionada.`
          : `${most.name} lidera o recorte, com ${formatPercent(
              summary.mostShare,
            )} da população selecionada.`,
    subhead:
      summary.count === 1
        ? `Com uma única ${unitWord}, não há amplitude, razão ou concentração para calcular; os indicadores descrevem apenas os valores dessa unidade e sua participação no Brasil.`
        : isFullSet
          ? `As três maiores ${unitPlural} reúnem ${formatPercent(
              summary.top3Share,
            )} do total; a diferença entre a maior e a menor é de ${formatInteger(
              summary.range,
            )} pessoas.`
          : `O recorte cobre ${formatPercent(
              summary.shareOfBrazil,
            )} da população brasileira da tabela; a diferença entre a maior e a menor unidade é de ${formatInteger(
              summary.range,
            )} pessoas.`,
    observations,
    comparisons,
    limitations,
  };
}
