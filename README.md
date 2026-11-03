# BRASIL EM DADOS — Painel de Análise Demográfica

Painel acadêmico interativo que consulta dados oficiais do **Censo Demográfico 2022** e apresenta população residente, área territorial e densidade demográfica de estados e regiões do Brasil.

O projeto foi construído como uma página HTML estática, sem framework e sem etapa de build, com **Chart.js 4.4.7 vendorizado** e uma **Skill personalizada do OpenCode** usada para orientar decisões de dados, visualização e acessibilidade.

## 🔗 Acesso rápido

| O quê | Link |
|---|---|
| **Site publicado (GitHub Pages)** | <https://icrooo21.github.io/brasil-em-dados/> |
| **Código-fonte no GitHub** | <https://github.com/icrooo21/brasil-em-dados> |

O site é público, abre direto no navegador (desktop ou celular) e consulta a API oficial do IBGE em tempo real, com cache e snapshot de contingência.

---

## 1. Objetivo

Demonstrar, de forma verificável e responsável, como transformar dados públicos em um painel analítico:

- consultar uma API oficial em tempo real;
- validar contrato, cobertura territorial e consistência dos valores;
- calcular indicadores somente a partir do recorte selecionado;
- comparar unidades sem confundir soma com estimativa oficial independente;
- separar fatos observados, cálculos e interpretações;
- comunicar falhas, cache e snapshot de forma explícita;
- oferecer uma versão acessível e imprimível para entrega acadêmica.

**Pergunta central:** como a população residente de 2022 se distribui entre as 27 Unidades da Federação e as 5 grandes regiões, e o que densidade e concentração acrescentam a essa leitura?

---

## 2. Fonte oficial dos dados

| Item | Valor |
|---|---|
| Pesquisa | Censo Demográfico 2022 |
| Tabela SIDRA | **4714** — População residente, área territorial e densidade demográfica |
| Variável de população | **93** — População residente (pessoas) |
| Variável de área | **6318** — Área da unidade territorial (km²) |
| Variável de densidade | **614** — Densidade demográfica (hab/km²) |
| Ano de referência | **2022** |
| Níveis consultados | Brasil (n1), Grandes Regiões (n2), UFs (n3) |

Página oficial da tabela: <https://sidra.ibge.gov.br/tabela/4714>

### Endpoints

**Principal — API de Agregados v3 do IBGE:**

```text
https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93|6318|614?localidades=N3[all]
```

Para regiões, troca-se `N3[all]` por `N2[all]`; para o Brasil, por `N1[all]`.

**Alternativa — API SIDRA `/values`:**

```text
https://apisidra.ibge.gov.br/values/t/4714/n3/all/v/93,6318,614/p/2022?formato=json
```

A API v3 é a primeira tentativa porque devolve as três variáveis em uma única resposta e apresentou resposta estável no ambiente de teste. Se ela falhar, o painel tenta a API SIDRA `/values`; depois, cache local; por último, o snapshot incorporado. **Toda troca de modo é sinalizada na interface.**

Documentação: <https://servicodados.ibge.gov.br/api/docs/agregados?versao=3>

---

## 3. O que o painel entrega

### Recorte e filtros

- **Modo Estados:** 27 UFs organizadas por região, com atalhos “Todas”, “Norte”, “Nordeste”, “Sudeste”, “Sul” e “Centro-Oeste”.
- **Modo Regiões:** as 5 grandes regiões oficiais, com totais próprios da API — as UFs **não** são somadas para fabricar um total regional.
- Seleção individual por checkbox, “Selecionar todas” e “Limpar seleção”.
- Atualização imediata de KPIs, gráficos, tabelas e texto analítico.
- Estado vazio explícito quando nenhuma unidade está selecionada.

### Indicadores

- população total do recorte;
- unidade mais populosa e menos populosa;
- quantidade de unidades e regiões representadas;
- amplitude (maior − menor);
- razão entre extremos;
- concentração das três maiores unidades;
- mediana, média e participação percentual;
- densidade máxima e mínima;
- curva de Lorenz e índice de Gini entre as unidades.

### Visualizações

1. **População por unidade territorial** — barras horizontais ordenadas; responde ao volume absoluto.
2. **Distribuição percentual** — rosca com até 7 unidades + “Demais”; responde à composição do recorte.
3. **Densidade demográfica** — barras em escala logarítmica; responde à concentração no território e evita que poucos valores altos achatam os demais.
4. **Curva de Lorenz da população** — mede concentração entre unidades, com linha de igualdade perfeita e Gini.

Cada gráfico tem uma pergunta própria, uma nota metodológica, `aria-label` descritivo e uma **tabela de dados equivalente** acessível por teclado. Reutilizar a mesma base é intencional: cada visualização faz uma pergunta diferente sobre ela.

### Análise dinâmica

A seção “O que os dados do recorte mostram” é recalculada a cada filtro e separa:

- **Principais observações** — valores do recorte ativo;
- **Comparações e diferenças** — amplitude, razão, Gini, densidade;
- **Limitações da análise** — ano único, agregação territorial, Gini entre unidades, ausência de causalidade.

Não há afirmações de crescimento, migração, tendência ou causalidade: o painel tem um único ano de referência.

---

## 4. Valores de referência (conjunto completo, 2022)

| Indicador | Valor |
|---|---:|
| População do Brasil (tabela 4714) | **203.080.756** |
| Soma das 27 UFs | **203.080.756** |
| Soma das 5 regiões | **203.080.756** |
| Maior UF | São Paulo — **44.411.238** |
| Menor UF | Roraima — **636.707** |
| Amplitude | **43.774.531** |
| Razão São Paulo / Roraima | **69,8×** |
| Mediana das UFs | **3.941.613** |
| Três maiores UFs | **39,9%** da população |
| Gini entre as 27 UFs | **0,5101** |
| Maior densidade | Distrito Federal — **489,06 hab/km²** |
| Menor densidade | Amazonas — **2,53 hab/km²** |

A igualdade entre a soma das UFs, a soma das regiões e o total do Brasil é usada como **checagem de consistência territorial**, não como uma estimativa nacional independente. O painel nunca soma UFs e regiões ao mesmo tempo.

---

## 5. Validação e tratamento

O fluxo está em `js/api.js`:

1. requisição com timeout de 20 s e `cache: "no-store"`;
2. verificação de HTTP, `Content-Type` e corpo não vazio;
3. rejeição de HTML ou JSON inválido;
4. conferência das variáveis **93, 6318 e 614**, do período **2022** e do nível territorial;
5. conversão numérica estrita; `"-"`, `"..."`, `"X"` e vazios são **ausentes**, nunca zero;
6. descarte de unidades com população, área ou densidade inválidas;
7. checagem de 27 UFs e 5 regiões;
8. coerência `densidade ≈ população ÷ área` (desvio relativo máximo observado: **0,107%**);
9. soma das UFs e das regiões comparada ao total do Brasil;
10. persistência em cache local somente após validação.

Falhas de rede, HTTP, contrato, validação ou timeout geram mensagens visíveis, com detalhes técnicos e ação de nova tentativa.

### Fallback em camadas

```text
API de Agregados v3
        ↓ falhou
API SIDRA /values
        ↓ falhou
cache local (com data da consulta)
        ↓ ausente/inválido
snapshot incorporado (com data da consulta)
        ↓ inválido
erro explícito, sem valores inventados
```

O snapshot atual foi gravado em **27/10/2026, 10:17:03 (Brasília)** a partir de consulta real ao SIDRA. Ele não é atualizado automaticamente e nunca é apresentado como consulta ao vivo.

---

## 6. Skill personalizada

Arquivo: `.opencode/skills/dashboard-analitico/SKILL.md`

```yaml
name: dashboard-analitico
description: Orientar a criação de dashboards acadêmicos profissionais com dados de APIs oficiais, gráficos acessíveis, análise estatística responsável, fontes verificáveis e interface responsiva.
```

A Skill foi carregada no OpenCode e aplicada ao projeto. Ela define princípios como:

- nunca inventar dados;
- separar fato, cálculo e interpretação;
- declarar universo, período e modo dos dados;
- não sugerir causalidade ou previsão sem desenho adequado;
- tratar carregamento, erro, cache, snapshot e seleção vazia;
- usar contraste AA, alvos de toque de 44 px, tabelas equivalentes aos gráficos e foco visível;
- manter cálculos puros separados da interface;
- incluir limitações e fontes verificáveis.

O checklist final da Skill foi usado na revisão do painel.

---

## 7. Tecnologias

- **HTML5** semântico;
- **CSS3** com variáveis, Grid, Flexbox, media queries e `@media print`;
- **JavaScript (ES Modules)** sem framework;
- **Chart.js 4.4.7** local (`vendor/chart.umd.min.js`), sem CDN em runtime;
- **API de Agregados v3 do IBGE** e **API SIDRA `/values`**;
- **Node.js** apenas para servidor estático e testes (`node:test`);
- `Intl.NumberFormat` / `Intl.DateTimeFormat` para pt-BR e fuso de Brasília.

Sem dependências npm de runtime e sem build.

---

## 8. Estrutura do projeto

```text
brasil-em-dados/
├── index.html                     # estrutura, seções e textos-base
├── favicon.svg
├── css/
│   └── style.css                  # layout responsivo, componentes e impressão
├── js/
│   ├── api.js                     # consulta, parsing, validação, cache e snapshot
│   ├── analysis.js                # cálculos puros e narrativa dinâmica
│   ├── app.js                     # DOM, filtros, gráficos e eventos
│   └── fallback-data.js           # snapshot validado de 27 UFs + 5 regiões + Brasil
├── vendor/
│   ├── chart.umd.min.js           # Chart.js 4.4.7
│   └── CHARTJS-LICENSE.md
├── tests/
│   ├── analysis.test.mjs          # 12 testes unitários
│   └── api.live.test.mjs          # 1 teste de integração real
├── .opencode/
│   └── skills/dashboard-analitico/SKILL.md
├── server.mjs                     # servidor estático sem dependências
├── package.json
└── README.md
```

---

## 9. Como executar

### Pré-requisitos

- Node.js 18+ (testado com Node.js 22);
- navegador moderno com ES Modules, `fetch`, Canvas e `Intl`;
- conexão com a internet para o modo ao vivo (o snapshot permite abrir sem conexão).

### Passos

```bash
cd brasil-em-dados
node server.mjs
```

Abra: <http://localhost:8000>

Ou, se preferir:

```bash
npm start
```

> **Não abra `index.html` diretamente como `file://`.** Navegadores podem bloquear módulos e requisições nesse modo. Se isso ocorrer, o painel exibe um aviso e orienta a usar o servidor local. O snapshot ainda pode ser exibido, mas o modo ao vivo não é confiável.

Para usar outra porta:

```bash
# PowerShell
$env:PORT=8080; node server.mjs

# Bash
PORT=8080 node server.mjs
```

---

## 10. Gerar o PDF

1. Abra o painel em `http://localhost:8000`.
2. Clique em **“Imprimir relatório / Salvar em PDF”**.
3. No diálogo do navegador, escolha **“Salvar como PDF”**.
4. Prefira papel **A4**, orientação retrato e margens padrão.
5. Ative **“Gráficos de plano de fundo”** para preservar as cores dos gráficos.

A impressão:

- oculta botões, filtros, avisos e status;
- abre automaticamente as quatro tabelas de dados;
- preserva título, data da consulta, indicadores, gráficos, análise, metodologia e fontes;
- restaura o estado das tabelas após a impressão.

O CSS de impressão foi validado por emulação de mídia `print` em Chromium; o PDF de teste gerado teve **13 páginas** em A4.

---

## 11. Testes executados

### Testes automatizados

```bash
npm test
# 12 testes unitários — 12 passaram
```

Cobrem:

- validação do snapshot (27 UFs, 5 regiões, somas iguais ao Brasil);
- maior/menor, amplitude, mediana e razão;
- participações percentuais;
- totais regionais sem duplicação de UFs;
- recorte do Sudeste;
- Lorenz monotônica e Gini em [0, 1];
- recorte com uma única unidade;
- narrativa dinâmica sem afirmação de crescimento;
- recorte vazio;
- parser SIDRA com valores ausentes;
- parser da API de Agregados v3 com as três variáveis;
- rejeição de soma incompatível com o Brasil.

```bash
npm run test:live
# 1 teste de integração real — 1 passou
```

O teste ao vivo consulta as APIs do IBGE (com internet), valida os 27 estados, as 5 regiões, o total de 203.080.756 e a consistência das somas.

### Verificações no navegador

Executadas em Chromium, com o servidor local:

| Verificação | Resultado |
|---|---|
| Carga ao vivo pela API v3 | OK — 27 UFs, 5 regiões, Brasil 203.080.756 |
| Erros de JavaScript no console | Nenhum (após inclusão do favicon) |
| Filtro “Sudeste” | 4 UFs, 84.840.113 pessoas, 41,8% do Brasil |
| Limpar seleção | KPIs zerados, gráficos ocultos, estado vazio visível |
| Selecionar todas | 27 UFs, 100,0% do Brasil |
| Modo Regiões | 5 regiões, 203.080.756, sem somar UFs |
| Uma única UF (Acre) | Narrativa “única UF”, sem comparações inválidas |
| Uma única região (Norte) | 17.354.884 pessoas, 8,5% do Brasil |
| Tabelas dos gráficos | 27 linhas em cada uma; abrem/fecham por teclado |
| Cache local (offline) | Modo “Cache local” com data formatada |
| Snapshot (offline + cache limpo) | Modo “Snapshot incorporado” com data original |
| Retorno ao modo ao vivo | OK após reconexão |
| Layout em 1280, 1024, 768, 390 e 320 px | Sem overflow horizontal da página |
| Alvos de toque e contraste | Ajustados para AA |
| Lighthouse (acessibilidade / boas práticas / SEO) | **100 / 100 / 100** |
| Impressão | Controles ocultos, 4 tabelas abertas, fontes preservadas |
| Links da seção de fontes | Documentação v3 e tabela 4714 responderam **200**; os portais institucionais responderam **403** a requisições automatizadas, mas os endereços são os oficiais |

### Itens não testados diretamente

- **Diálogo nativo de impressão** de cada navegador (o layout foi validado por emulação `print` e por PDF gerado em Chromium; a interface do diálogo varia por navegador).
- **Safari, Firefox e dispositivos físicos** — os testes de responsividade foram feitos por emulação de viewport em Chromium.
- **Indisponibilidade real e prolongada do IBGE** — o fallback foi testado simulando modo offline e cache limpo, não uma queda simultânea dos servidores oficiais.
- **Leitores de tela reais** — foram usados `aria-label`, tabelas equivalentes, foco visível e auditoria automática Lighthouse; não houve teste com usuários de leitor de tela.

---

## 12. Limitações e cuidados de leitura

1. **Ano único (2022).** O painel não mede crescimento, redução, migração ou tendência temporal.
2. **População residente** não é população presente, eleitorado ou estimativa anual.
3. **Soma do recorte** é a soma das unidades selecionadas. Fora do conjunto completo, ela não representa o Brasil.
4. **Regiões e UFs não são somadas juntas.** Os totais regionais vêm diretamente da API.
5. **Gini e Lorenz** medem concentração dos totais populacionais entre unidades, não desigualdade entre pessoas, renda ou acesso a serviços.
6. **Densidade** é população ÷ área; não mede urbanização, pressão ambiental ou qualidade de vida.
7. **Percentuais arredondados** podem não somar exatamente 100,0% na apresentação.
8. **Comparações com outras edições do Censo** exigem compatibilização territorial e metodológica.
9. **Disponibilidade da API** pode variar; cache e snapshot são sempre rotulados.
10. **Nenhuma relação causal** entre população, densidade e características econômicas ou sociais é inferida.

---

## 13. Acessibilidade e responsividade

- contraste de texto AA (Lighthouse 100 em acessibilidade);
- `fieldset`/`legend` nos grupos de filtros;
- rótulos `aria-label` nos checkboxes e botões de modo;
- canvas com `role="img"` e descrição textual;
- tabela equivalente em `<details>` para cada gráfico;
- foco visível e link “Pular para o conteúdo”;
- alvos de toque de pelo menos 44 px nos controles;
- respeito a `prefers-reduced-motion`;
- layout funcional de 320 px a telas amplas;
- tabelas com rolagem horizontal no celular;
- versão de impressão sem controles.

---

## 14. Snapshot incorporado

Arquivo: `js/fallback-data.js`

- consulta real ao SIDRA/IBGE;
- tabela 4714, ano 2022;
- 27 UFs, 5 regiões e total do Brasil;
- gravado em **2026-10-27T13:17:03.944Z** (10:17:03 em Brasília);
- usado somente quando API e cache falham;
- a interface mostra o rótulo “Snapshot incorporado” e a data original.

Para atualizar o snapshot, é necessário executar uma nova consulta oficial e substituir o arquivo com os valores validados. O projeto não inventa nem completa valores ausentes.

---

## 15. Referências

- IBGE. **Censo Demográfico 2022**: população residente, área territorial e densidade demográfica. Tabela 4714. SIDRA. <https://sidra.ibge.gov.br/tabela/4714>
- IBGE. **API de Agregados v3**. <https://servicodados.ibge.gov.br/api/docs/agregados?versao=3>
- IBGE. **API SIDRA — endpoint `/values`**. <https://apisidra.ibge.gov.br/>
- IBGE. **Censo 2022**. <https://censo2022.ibge.gov.br/>
- Chart.js. **Documentação e código-fonte**. <https://www.chartjs.org/>

---

**Nota metodológica:** os valores observados pertencem ao IBGE. Os totais, percentuais, diferenças, mediana, média, densidade, Lorenz e Gini exibidos no recorte são cálculos deste painel sobre os dados oficiais. As frases da seção de análise são leituras analíticas, não conclusões do IBGE.
