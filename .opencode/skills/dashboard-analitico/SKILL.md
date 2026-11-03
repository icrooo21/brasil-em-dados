---
name: dashboard-analitico
description: Orientar a criação de dashboards acadêmicos profissionais com dados de APIs oficiais, gráficos acessíveis, análise estatística responsável, fontes verificáveis e interface responsiva.
---

# Dashboard Analítico

## Quando usar

Use esta Skill ao construir painéis, relatórios ou páginas de análise de dados
que precisem combinar estética profissional, dados de fontes oficiais,
transparência metodológica e leitura responsável. Ela vale tanto para a
implementação quanto para a revisão final do artefato.

## 1. Princípios não negociáveis

1. **Nunca invente dados.** Todo número exibido deve vir da API, de cálculo
   explícito sobre esses dados ou de um snapshot claramente identificado.
2. **Separe fato, cálculo e interpretação.** Resultados observados recebem
   fonte e período; cálculos recebem fórmula; interpretações são apresentadas
   como leitura analítica, não como dado oficial.
3. **Declare o universo.** Diga quais unidades territoriais entram na soma,
   qual é o período de referência e se há cache ou snapshot.
4. **Não compare períodos diferentes** sem explicar a diferença de fonte ou
   metodologia.
5. **Não sugira causalidade nem faça previsões** sem desenho metodológico e
   dados adequados.
6. **Trate falhas explicitamente.** Carregamento, erro, cache, ausência de
   dados e seleção vazia precisam de mensagens visíveis e compreensíveis.

## 2. Direção visual

- Fundo claro em tom neutro (off-white/cinza muito claro), texto principal em
  azul-escuro e cor complementar em verde/turquesa.
- Use uma paleta consistente com papéis definidos: primária, secundária,
  destaque, alerta, sucesso, texto e borda. Não introduza cores aleatórias.
- Cartões com cantos arredondados, borda suave e sombra discreta. Evite
  excesso de sombras, gradientes chamativos e efeitos decorativos sem função.
- Tipografia moderna e legível, com escala clara de títulos, corpo, rótulos e
  números. Números grandes usam `font-variant-numeric: tabular-nums`.
- Organize a leitura em: cabeçalho, contexto, filtros, indicadores, gráficos,
  análise, metodologia, fontes.
- Use espaçamento generoso e alinhamento consistente. O painel deve parecer
  um produto de análise, não uma página genérica de exercício.

## 3. Estrutura e hierarquia

- Cabeçalho com nome do projeto, subtítulo, selo de fonte oficial e data/hora
  da última consulta bem-sucedida.
- Indicadores em cartões curtos: valor principal, rótulo, unidade e uma linha
  de contexto. Não repita o mesmo número em cartões diferentes.
- Cada gráfico deve responder a uma pergunta analítica distinta. Se dois
  gráficos usam a mesma base, explique o que cada um revela.
- Filtros devem ficar próximos dos dados que controlam e mostrar o recorte
  ativo. Preserve a seleção ao alternar entre visões sempre que possível.
- Inclua botão de impressão e uma versão de impressão limpa, sem controles.

## 4. Acessibilidade e responsividade

- Contraste mínimo AA para texto normal e componentes.
- Todo controle precisa de rótulo visível ou `aria-label`; grupos de
  checkboxes usam `fieldset` e `legend`.
- Não dependa apenas de cor para transmitir significado.
- Canvas de gráfico recebe `role="img"` e `aria-label` descritivo; ofereça
  tabela de dados equivalente, acessível por teclado.
- Respeite `prefers-reduced-motion`.
- Layout funcional de 320 px a telas amplas. Grades usam `minmax()` e
  quebram para uma coluna no celular; tabelas têm rolagem horizontal.
- Alvos de toque com pelo menos 44 px. Foco visível em todos os controles.
- Em impressão, oculte filtros, botões e mensagens transitórias; preserve
  título, data da consulta, indicadores, gráficos, tabelas, análise e fontes.

## 5. Validação de dados de API

Antes de renderizar:

1. Verifique status HTTP e `Content-Type`.
2. Converta o corpo com tratamento de erro; rejeite HTML ou texto inesperado.
3. Confirme o contrato da resposta (cabeçalho, códigos de variável, período e
   nível territorial).
4. Converta valores com função estrita; trate `"-"`, `"..."`, `"X"` e vazios
   como ausentes, nunca como zero.
5. Descarte registros sem população válida e registre quantos foram
   descartados.
6. Valide faixas plausíveis (população > 0, área > 0, densidade > 0) e a
   coerência `densidade ≈ população / área`.
7. Confira a contagem de unidades e a soma contra o total oficial do mesmo
   recorte quando disponível.
8. Preserve os metadados: tabela, variável, período, URL e instante da
   consulta.

Se a validação falhar, mostre erro. Não complete lacunas com números
inventados nem use outro período silenciosamente.

## 6. Cache e indisponibilidade

- Cache local deve ter data/hora e origem explícitas.
- Se a API falhar, tente cache e depois snapshot incorporado, sempre
  identificando o modo ativo com um aviso visível.
- Nunca mostre dados antigos como se fossem consulta ao vivo.
- Ofereça ação de nova tentativa e explique como executar por HTTP local se o
  navegador bloquear `file://`.

## 7. Análise estatística responsável

- Some apenas unidades mutuamente exclusivas; verifique duplicidade
  territorial.
- Ao somar unidades, rotule como "soma das unidades selecionadas" e não como
  estimativa oficial independente.
- Participação percentual: `100 × valor / total do recorte`.
- Amplitude: `maior − menor`; razão: `maior / menor`.
- Mediana: valor central após ordenação (média dos dois centrais quando par).
- Curva de Lorenz e Gini só podem ser usados com a unidade de análise
  declarada; no caso de populações por UF, medem concentração da população
  entre unidades, não desigualdade de renda.
- Arredonde apenas na apresentação; guarde precisão nos cálculos.
- Toda conclusão deve citar números do recorte ativo. Se o usuário mudar o
  filtro, a conclusão deve mudar junto.
- Limitações obrigatórias: ano único, agregação territorial, valores
  arredondados pela fonte, dependência de conectividade e diferença entre
  população residente e outras métricas.

## 8. Código e manutenção

- Separe acesso à API (`api.js`), cálculos puros (`analysis.js`) e interface
  (`app.js`). Cálculos não devem depender do DOM.
- Centralize constantes de fonte, tabela, variáveis e URLs.
- Funções pequenas, nomes descritivos, comentários apenas onde a intenção não
  é óbvia.
- Destrua e recrie gráficos ao atualizar, evitando instâncias duplicadas.
- Use `Intl.NumberFormat('pt-BR')` para números e `Intl.DateTimeFormat` para
  datas, com unidades explícitas.
- Teste cálculos com dados conhecidos e inclua um teste de consistência da
  soma das UFs contra o total do Brasil.

## 9. Checklist de entrega

- [ ] API oficial respondeu e o contrato foi validado.
- [ ] Fonte, tabela, variável e período aparecem na interface.
- [ ] Indicadores calculados a partir do recorte ativo.
- [ ] Pelo menos três visualizações com perguntas distintas.
- [ ] Filtros funcionam e atualizam tudo.
- [ ] Estados vazio, carregando, erro e cache tratados.
- [ ] Tabelas equivalentes aos gráficos e navegação por teclado.
- [ ] Layout testado no celular e no desktop.
- [ ] Impressão/PDF sem controles e com fontes.
- [ ] Conclusões dinâmicas, limitadas e sem causalidade.
- [ ] README com execução, metodologia e limitações.
