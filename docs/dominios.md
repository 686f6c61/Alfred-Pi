# Packs de trabajo del harness

> Modo de este documento: mezcla consciente de referencia y how-to. La
> tabla de packs y la descripción de skills y prompts son referencia; los
> «Casos de uso» son how-to orientado a tarea. Se declara la mezcla como
> decisión (A-DOC-06) en lugar de partir el archivo. Cómo añadir un pack
> o una skill: [extender.md](extender.md). El tutorial de primer arranque
> vive en [instalacion.md](instalacion.md#primer-arranque).

Once packs convierten a pi en especialista de un oficio. El harness
expone el mismo catálogo que el README, con estos nombres, este orden,
estas skills y estos prompts. El recuento sale del árbol (README y
`public-docs-figures`); esta tabla es la lista viva.

## Forma de un pack

Cada directorio `packs/<id>/` lleva `domain.json` (manifiesto),
`context.md` (postura inyectada, ~15 líneas), `skills/<nombre>/SKILL.md`
y `prompts/<nombre>.md`. El radar puntúa `triggers` (palabra completa,
peso por longitud) y, si nadie casa, `repoHints` (un glob `*` en el
último segmento, solo la raíz del cwd). A igualdad de puntos gana el
`name` que va antes alfabéticamente.

Frontmatter de cada skill y prompt: `description` con «Use when…»
(«Use al…» en escritura-es), `origin` (`original` o `adapted`) y
`license` SPDX. La barra de diez puntos (oficio, procedimiento, anti-patrones,
límites, higiene) está en [extender.md](extender.md).

El autopilot inyecta el contexto de **un** pack por turno. Las skills
de todos los packs habilitados viven en el menú del modelo. Tras
repartir las cartas (`/autopilot` → habilitar todas las salas) hace
falta `/reload`.

| Pack | Skills | Prompts |
|---|---|---|
| **Security** | threat-modeling, owasp-review, sonarqube-audit, secret-scanning, dependency-audit | `/audit` `/threat-model` `/sonar` `/fix-findings` |
| **AI agents** | agent-orchestration (fan-out, DAG/frontera, presupuestos, protocolo de merge) | `/fanout` `/implement` |
| **Docs** | documentation (Diátaxis), adr, api-reference | `/adr` `/docs-audit` |
| **Spanish writing** | rae-normas, traduccion-en-es | `/revision-es` |
| **Clean code** | solid-review, refactoring-patterns, tdd-workflow, pr-review-checklist, tech-debt-inventory, ddd-architecture | `/review-clean` `/refactor` |
| **Web / fullstack** | api-design, http-service, app-persistence, async-jobs, e2e-testing, browser-improve, astro-development, visual-guides, web-performance, frontend-security, i18n-l10n, release-gate | `/review-api` `/scaffold-crud` `/guide` |
| **Compliance** | privacy-review, license-compliance, a11y-audit | `/privacy-check` `/a11y-audit` |
| **Landing design** | landing-copy, visual-critique (visión), conversion-checklist, design-systems, ab-testing, seo-analytics | `/landing-review` `/landing-from-image` |
| **DevOps / infra** | docker-workflow, github-actions, incident-triage, kubernetes-triage, observabilidad, db-ops |  `/ci` `/diagnose-502` `/infra-audit`  |
| **Data / análisis** | sql-optimization, pandas-analysis, dashboard-design, data-quality | `/query-review` `/explore` `/dashboard` |
| **QA / testing** | test-strategy, fixtures-factories, contract-testing, flaky-hunting, bug-repro-loop | `/test-plan` `/flaky` `/coverage-gaps` |

Habilitación: `/domains` (global con symlinks en `~/.pi/agent/` o por
proyecto en `.pi/`). Al deshabilitar, el harness solo retira los enlaces
que él creó; los archivos del usuario nunca se tocan.

## Security

Skills: **threat-modeling** (modelo de amenazas con activos, fronteras,
rutas de abuso y tres arreglos priorizados, todo anclado a archivo y línea),
**owasp-review** (pasada OWASP Top 10 con caza por categoría y prueba de
alcanzabilidad), **sonarqube-audit** (levanta SonarQube
community en Docker, credenciales, proyecto, escáner y métricas),
**secret-scanning** (secretos y credenciales filtradas en el árbol de
trabajo, la historia de git, archivos env y CI, con veredicto por
hallazgo: confirmado, sospechoso o falso positivo) y **dependency-audit**
(CVEs, paquetes sin mantenimiento y riesgo de cadena de suministro leídos
desde los lockfiles; triaje por explotabilidad, no por CVSS, y plan de
actualización por grupos). Prompts: `/audit`, `/threat-model`, `/sonar`,
`/fix-findings` (remedia los hallazgos de una auditoría previa: parche
mínimo por hallazgo, prueba de verificación y tabla final de estado).
Recomendados: @vigolium/piolium, pi-secrets-guard. Retirados por falta de
vida (menos de 100 descargas/mes y meses sin publicar): pi-sonar y
@testzugang/pi-dependency-audit.

Casos de uso:
1. **Auditar un repo**: «audita la seguridad de este repo» (o `/audit .`).
   El autopilot inyecta el contexto defensivo del pack y el modelo combina
   owasp-review con lectura real del código: hallazgos con severidad y fix
   mínimo, más veredicto desplegable.
2. **Modelo de amenazas de una feature**: «threat model del checkout».
   Activos, fronteras de confianza, rutas de abuso, mitigaciones presentes,
   huecos y tres fixes prioritarios.
3. **SAST local completo**: `/sonar`. El harness arranca SonarQube en
   Docker (reutiliza si ya corre), guarda credenciales en
   `~/.pi/agent/alfred-pi/sonar.env`, registra el proyecto, escanea y
   reporta quality gate más métricas.

## AI agents

Skills: **agent-orchestration** (selector de patrón sequential/fan-out/crew
con worktrees/cadena de roles/map-reduce/DAG con frontera, brief por
subagente, asignación de modelo por rol, disciplina de presupuesto y
protocolo de merge).
Prompts: `/fanout`, `/implement` (grafo de tickets o spec: frontera,
worktrees, un recolector, `/stack` y `/usage` antes de la flota).
Recomendados: pi-subagents,
@quintinshaw/pi-dynamic-workflows, pi-crew, @narumitw/pi-goal (objetivos
autónomos persistentes; exige presupuesto de goal fijado, ver la nota en el
contexto del pack), pi-memory (memoria persistente; riesgo de secretos en el
índice local, se instala solo por `/packages` con auditoría, nunca en
silencio, ver el aviso en el contexto del pack) y @mjasnikovs/pi-task
(planificación estructurada para modelos locales; entra también en el
selector local-first).

Casos de uso:
1. **Revisión paralela de N unidades**: `/fanout revisa estos 8 PRs`.
   Descompone, estima coste desde la tabla de precios del harness, asigna
   modelo barato por unidad y un colector fusiona con protocolo de merge.
2. **Investigación amplia**: «investiga qué biblioteca conviene» con
   fan-out de lecturas solo lectura y fusión de criterios.
3. **Escritura paralela sin conflictos**: crew con un worktree por
   escritor y revisión de diffs como protocolo de merge.
4. **Grafo de tickets**: `/implement` más un spec o lista con aristas
   de bloqueo. Si no hay aristas, usa `/fanout`.

## Docs

Skills: **documentation** (Diátaxis: tutorial/how-to/referencia/explicación;
docstrings del porqué; auditoría de documentación), **adr** (registro de
decisiones con alternativas rechazadas) y **api-reference** (referencia de
API en modo Diátaxis puro, generada desde OpenAPI o desde los contratos de
las rutas: tablas secas de endpoints, parámetros, errores y ejemplos).
Prompts: `/adr`, `/docs-audit`. Recomendados: @noice-tech/pi-changelog,
@barlevalon/documentation-system-skill, @evolvehq/docflow. Retirado por
falta de vida: @artale/pi-doc.

Casos de uso:
1. **Documentar una decisión**: `/adr usamos X en vez de Y por Z` escribe
   el registro numerado tras leer el código real.
2. **Auditar la documentación del repo**: `/docs-audit .` clasifica cada
   página por modo Diátaxis, marca modos mixtos, snippets que no corren y
   páginas huérfanas.
3. **README de proyecto**: esqueleto OSS de la skill documentation aplicado
   directamente.

## Spanish writing

Skills: **rae-normas** (tildes y diacríticos, signos con comillas
jerarquizadas, mayúsculas, extranjerismos, concordancia, dequeísmo,
escritura para pantallas; normas de la casa: cero emojis y sin raya dentro
de las frases) y **traduccion-en-es** (traducción entre EN y ES con encargo,
miniglosario, localización de formatos, doble control y dudas devueltas al
autor o al especialista). Prompt: `/revision-es`.
Recomendados: remove-ai-writing-indicators.

Casos de uso:
1. **Corregir un texto o archivo**: `/revision-es README.md` edita in situ
   con diff y lista los cambios con la norma aplicada.
2. **Redactar en español correcto**: avisos legales, changelogs, copys;
   el contexto del pack vela por registro y normas mientras escribes.
3. **Unificar tono de un documento largo** sin tocar el contenido técnico.

## Clean code

Skills: **solid-review** (detección de dolor real por principio, no
dogmática), **refactoring-patterns** (movimientos con red de seguridad),
**tdd-workflow** (rojo-verde-refactor con reglas de alcance),
**pr-review-checklist** (revisión de PR: paso 0 Spec, fidelidad al
encargo; luego corrección, diseño y tests; el eje Spec no se mezcla con
la corrección),
**tech-debt-inventory** (inventario de deuda con ubicación, síntoma,
coste y estimación; prioriza por interés compuesto, no por molestia) y
**ddd-architecture** (lenguaje ubicuo, contextos delimitados con mapa de
contextos, agregados con invariantes, eventos de dominio).
Prompts: `/review-clean`, `/refactor`. Recomendados: pi-lens,
@narumitw/pi-github-pr, @ff-labs/pi-fff, pi-simplify y
@plannotator/pi-extension (revisión interactiva de planes con anotaciones;
complementa, no sustituye, al esencial pi-plan-mode).

Casos de uso:
1. **Revisión de calidad**: `/review-clean .` devuelve bugs primero, luego
   dolor de diseño y huecos de tests, con fix mínimo.
2. **Refactor sin cambio de comportamiento**: `/refactor src/foo.ts`
   planifica pasos verificables y aplica uno a uno; sin tests y con código
   que importa, escribe tests de caracterización antes.
3. **Feature con TDD**: la skill marca qué probar primero y qué dejar sin
   test (glue trivial, prototipos).

## Web / fullstack

Skills: **api-design** (contrato público), **http-service** (handlers
reales, ruta efectiva, auth en código), **app-persistence** (ORM de
producto, migraciones, N+1), **async-jobs** (colas, reintentos,
idempotencia), **e2e-testing** (suite Playwright, flake),
**browser-improve** (Chrome/CDP para medir y arreglar, no para specs),
**astro-development** (islas, Collections), **visual-guides** (un paso,
una captura, máscara, regenerable), **web-performance** (presupuestos CWV
en CI), **frontend-security** (XSS, CSP, tokens en el navegador),
**i18n-l10n** (ICU, seudolocalización) y **release-gate** (salida con
evidencia). Las gemelas `hardening-checklist` y `deploy-checklist`
siguen retiradas.
Prompts: `/review-api`, `/scaffold-crud`, `/guide`.
Recomendados: pi-browser-harness. Retirado por falta de vida:
@wdalhaj/pi-astro-mcp.

Casos de uso:
1. **Scaffold de un recurso completo**: `/scaffold-crud invoices` genera
   migración, API validada, vistas con estados y tests, imitando los
   patrones del repo.
2. **Guía visual de usuario**: `/guide https://app.com crear proyecto`
   produce docs/guide-\<flujo\>/ con captura por paso y spec de Playwright
   regenerable (la guía no se pudre).
3. **Revisión de API**: `/review-api routes/` entrega tabla de rutas y
   hallazgos por potencial de rotura.

## Compliance

Skills: **privacy-review** (GDPR: inventario de datos, consentimiento,
terceros, derechos, retención), **license-compliance** (inventario SPDX,
obligaciones por grupo, compatibilidad, atribución), **a11y-audit**
(WCAG 2.2 AA: pasada automática más patrones manuales).
Prompts: `/privacy-check`, `/a11y-audit`.
Recomendados: ninguno. El ecosistema no ofrece hoy paquetes de compliance
con tracción ni mantenimiento; el pack se sostiene con sus skills y declara
el vacío en lugar de inventar recomendados.

Casos de uso:
1. **Formulario con datos personales**: `/privacy-check src/forms/signup`
   mapea el flujo de datos y señala consentimiento y terceros.
2. **Licencias de dependencias**: «audita las licencias» agrupa por
   obligación y marca mezclas incompatibles.
3. **Accesibilidad de una vista**: `/a11y-audit src/pages/home` con
   hallazgos blocker/serious/moderate y los tres fixes de mayor impacto.

## Landing design

Skills: **landing-copy** (copy deck trazable a producto, antes y después,
escalera de objeciones, prueba y microcopy), **visual-critique** (capturas
comparables, escala de severidad, umbral de silencio y arreglo concreto),
**conversion-checklist** (cada hallazgo exige elemento, captura, evento o
métrica, con LCP móvil y una única hipótesis derivada a A/B).
Nueva: **design-systems** (catálogo de sistemas: Material 3, Apple HIG,
Fluent, Ant, shadcn/ui, MUI, Bootstrap, Chakra, Radix, Carbon, Polaris;
disciplina de tokens; auditoría de adherencia), **ab-testing**
(hipótesis de una sola variable, tamaño muestral y duración en semanas
completas, análisis honesto sin mirar el test a mitad de camino) y
**seo-analytics** (SEO técnico: canonical, meta y OG, datos estructurados,
sitemap; eventos de funnel en GA4, Plausible o Umami; verificación por
Lighthouse, `curl` y el depurador de eventos).
Prompts: `/landing-review`, `/landing-from-image`.
Recomendados: design-playbook, @pi-stef/figma.

Casos de uso:
1. **Replicar un mockup**: `/landing-from-image <imagen>` describe la
   estructura, la mapea a la estructura de copy e implementa responsive y
   accesible.
2. **Crítica de una landing existente**: `/landing-review <url o captura>`
   conserva las capturas y prioriza solo hallazgos con impacto demostrable.
3. **Reescritura de copy**: hero y escalera de secciones en un copy deck con
   texto anterior, texto propuesto, decisión y evidencia pendiente.

## DevOps / infra

Skills: **docker-workflow** (Dockerfile y compose, bucle de desarrollo,
depuración, limpieza y endurecimiento de digest, privilegios y red en una sola
skill), **github-actions** (esqueleto, 8 reglas numeradas, pi dentro de CI,
trusted publishing OIDC y límite explícito frente a GitLab CI),
**incident-triage** (estabilizar, localizar capa a capa, playbook 502/503/504
y límites de mutación), **kubernetes-triage**
(crashloop, OOMKill y rollouts atascados, probes, requests y limits;
flujo kubectl describe, logs y rollout undo, con informe literal),
**observabilidad** (logs
estructurados, métricas RED y USE, alertas con umbrales derivados de SLO,
trazas, dashboards y verificación PromQL) y **db-ops** (migraciones sin locks,
backups con ensayos de restauración, queries lentas, conexiones, volúmenes y
formato de informe operativo). Prompts: `/ci`, `/diagnose-502`, `/infra-audit`.
Recomendados: @danypops/pi-pipes (CI multiplataforma para el agente: GitHub
Actions, GitLab CI, Jenkins; 7 400 descargas/mes y publicación activa).
Retirados por falta de vida (menos de 100 descargas/mes): @realvendex/pi-ci y
@gerdloos/npm-trusts-github-skill.

Casos de uso:
1. **CI de un repo**: `/ci` detecta el stack y escribe
   .github/workflows siguiendo las reglas del pack; añade publishing por
   OIDC si el proyecto es publicable.
2. **Servicio caído**: `/diagnose-502 app` localiza la capa que falla con
   comprobaciones reales (DNS, proxy, origen, app, dependencias) y entrega
   el fix aplicado o el comando exacto.
3. **Auditoría de infra**: `/infra-audit .` inventaria compose y
   Dockerfiles, comprueba digest, privilegios y red, y arroja riesgos por
   ubicación con los tres cambios de mayor impacto.

## Data / análisis

Skills: **sql-optimization** (EXPLAIN bottom-up, índices por forma de query,
keyset pagination), **pandas-analysis** (exploración reproducible con puerta
de revisión, grano declarado y límites de inferencia), **dashboard-design**
(preguntas y decisiones trazables, contrato de métricas, comprobación de
filtros y plantilla de hallazgos), **data-quality** (perfilado reproducible,
consistencia entre fuentes y veredicto de aptitud para un uso declarado).
Prompts: `/query-review`, `/explore`, `/dashboard`. Recomendados:
@4fu/pi-python. Hints de repo:
`*.sql`, notebooks, dbt.

Casos de uso:
1. **Query lenta**: `/query-review <consulta>` entrega olores del plan con
   evidencia, reescritura e índices justificados, y antes/después medido.
2. **Explorar un CSV**: `/explore datos.csv` perfila, limpia con la razón de
   cada paso y entrega hallazgos con números, unidades y advertencias.
3. **Dashboard que responde preguntas**: `/dashboard` lista las preguntas de
   negocio primero y diseña una tile por pregunta con veredicto por tile.

## QA / testing

Skills: **test-strategy** (artefacto con matriz de riesgo, nivel, aserción,
comando, presupuesto y criterio de salida), **fixtures-factories** (factorías
ancladas al contrato de la entidad, reloj y azar controlados, estado aislado y
limpieza explícita),
**contract-testing** (contratos consumidor-proveedor verificados en CI,
protocolo de cambios rompientes), **flaky-hunting** (cuantificar, clasificar
el olor, reproducir determinista, arreglar la causa; cuarentena con dueño y
caducidad), **bug-repro-loop** (mando rojo determinista, hipótesis
falsables, una sonda etiquetada y regresión; no es un 502 ni un flake).
Prompts: `/test-plan`, `/flaky`, `/coverage-gaps`.
Recomendados: tdd-enforcer (impone las fases rojo-verde-refactor; vivo y del
oficio: publicación reciente y tracción suficiente para no ser cadáver). El
resto de la oferta QA está dormida o no encaja, y no se recomienda. Hints de
repo: `e2e/`, `tests/`, playwright config.

Casos de uso:
1. **Plan de pruebas de una feature**: `/test-plan <feature>` entrega la
   matriz de riesgo y los tests a escribir primero, priorizados.
2. **Flaky que solo falla en CI**: `/flaky <test>` clasifica (tiempo, orden,
   async, entorno, concurrencia), da la receta de reproducción y arregla la
   causa, nunca el reintento.
3. **Huecos de cobertura**: `/coverage-gaps` cruza caminos críticos contra
   lo que la suite afirma hoy y lista los huecos que importan con su nivel.
4. **Bug que resiste la primera lectura**: «este bug no se reproduce» o
   «reproduce the bug». Construye el mando que ya ha fallado, descarta
   hipótesis y cierra con una prueba de regresión. Si el servicio está
   caído, es `incident-triage`; si solo falla a veces en CI, `/flaky`.
