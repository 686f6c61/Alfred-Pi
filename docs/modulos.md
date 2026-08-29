# Mapa de módulos

Frontera: `lib/` es Node puro, testeable sin agente. Excepción vigilada:
`screens.ts` y `onboarding-flow.ts` importan paquetes de pi. `index.ts`
es el adaptador. Tests con bun, sin agente; la cifra sale del árbol, no
de un entero copiado. How-to: [extender.md](extender.md) y
[probar.md](probar.md).

## index.ts (entry)

Registra los 11 comandos y el flag `--alfred-pi` (doctor, usage,
stack, autopilot, domains; variantes `:json`). `--harness-moe` es
alias deprecado y en 0.4.0 sigue respondiendo. Engancha:

- `session_start`: flag headless, asistente de primer arranque, cabecera,
  statusline, update-check.
- `before_agent_start`: llama a `curateTurn` y aplica `setModel` si hay
  relevo.
- `turn_end`: cuenta fallos de turno desde `stopReason`; un éxito limpia la racha y un aborto no cuenta. (pi no emite evento HTTP alguno en fallos de conexión o 5xx, así que el conteo vive en el cierre del turno.)
- `model_select`: refresco del statusline.

Referencia de comandos: [comandos.md](comandos.md).

## lib/

| Módulo | Responsabilidad | Exports clave |
|---|---|---|
| `paths.ts` | Rutas: agent dir (respeta `PI_CODING_AGENT_DIR`), data dir, localización del repo (walk-up hasta `packs/`) | `getBaseDir`, `getDataDir`, `findRepoRoot` |
| `diff.ts` | Diff unificado LCS con hunks de 3 líneas de contexto | `unifiedDiff`, `diffLines` |
| `config-io.ts` | Tipos de los archivos nativos, lectura tolerante, escritura atómica, backups con retención/pin/restauración, plan→apply | `loadModels/Auth/Settings`, `planWrites`, `applyPlan`, `backupFiles`, `restoreBackup` |
| `prober.ts` | Sondas por api type (bearer, x-api-key, key en query), descubrimiento `/models`, deep probe de 1 token, resolución de claves literales y `$ENV` (`!` se rechaza), máscara, sonda de rol developer vs system | `probeLiveness`, `discoverModels`, `deepProbe`, `resolveKeyRef`, `probeSystemRoleSupport` |
| `presets.ts` | 30 presets de proveedor con clave por env y `compat` para servidores propios | `PROVIDER_PRESETS`, `findPreset` |
| `doctor.ts` | Chequeos estáticos de config, reconciliación, liveness paralelo, sonda de rol, historial `health.jsonl` y formato del informe | `runDoctor`, `checkConfigs`, `summarizeHealth`, `formatDoctorReport` |
| `profiles.ts` | Perfiles: pilas `{provider, model, thinkingLevel}` con cadena de preferencia | `loadProfiles`, `pickStep`, `upsertProfile` |
| `domains.ts` | Manifiestos de packs (`triggers`, `repoHints`), descubrimiento, habilitación por symlinks con comprobación de propiedad, contexto apilado de los packs habilitados | `discoverDomains`, `enableDomain`, `disableDomain`, `enabledDomainsContext` |
| `autopilot.ts` | Estado y cascada de detección (prompt → repo → sticky) con scoring ponderado; contexto enfocado de un pack | `detectDomain`, `detectDomainFull`, `domainContext` |
| `fallback.ts` | Relevo entre turnos: conteo de fallos consecutivos (umbral 2), elección del siguiente eslabón resoluble | `recordTurnOutcome`, `nextStepAfter` |
| `budget.ts` | Gasto del día desde sesiones + precios de models.json; niveles 80/100 con aviso único diario; nota de frugalidad | `evaluateBudget`, `spendToday`, `budgetExceededNote` |
| `usage.ts` | Colección offline desde las sesiones JSONL de pi, agregados por modelo/día/top sesiones, tarifación honesta (n/a sin precio) | `collectUsage`, `aggregateUsage`, `formatUsageReport` |
| `catalog.ts` | Catálogo models.dev con caché 24 h, alias de proveedor, autorrelleno de campos vacíos, intenciones de modelo | `fetchCatalog`, `classifyIntention`, `pickModelsForIntention` |
| `ollama.ts` | API nativa de Ollama: tags/ps/rm/pull con progreso NDJSON; modelos `:cloud` con `_launch` | `ollamaTags`, `ollamaPull`, `toModelsEntry` |
| `essentials.ts` | Paquetes curados de paridad; tramos `base` / `advanced`; detección de instalados | `ESSENTIALS`, `essentialOrchestrationTiers` |
| `packages-registry.ts` | Búsqueda npm (keyword `pi-package`), descargas mensuales, ficha | `searchPiPackages`, `packageDetail` |
| `pkg-audit.ts` | Auditoría pre-instalación y recibos inmutables `nombre@version` | `scanSources`, `auditNpmPackage`, `auditGitSource`, `saveAuditReceipt` |
| `persona.ts` | Voces (Alfred, neutral), estado, prompt de system y directiva oculta, cabecera | `personaPrompt`, `personaDirective`, `buildHeaderLines` |
| `update-check.ts` | Canal de actualizaciones por manifiesto con caché 24 h y comparación semver | `checkForUpdate`, `compareVersions` |
| `stack.ts` | Recogida pura de la torre de control (TUI y headless comparten fuente) | `collectStack`, `formatStackText` |
| `onboarding.ts` | Estado del asistente (`done`, `deferred`, `blocked`) | `shouldShowOnboarding`, `completeOnboarding` |
| `onboarding-flow.ts` | Diálogo guiado (nube, local, pasarela). Puede importar tipos de pi | `onboardingFlow` |
| `screens.ts` | Toda la TUI. Puede importar `@earendil-works/pi-tui` | `providersDashboard` y una pantalla por comando |
| `curate-turn.ts` | Compositor puro del parche de turno | `curateTurn` |
| `house-copy.ts` | Cadenas de pie y avisos (sala, presupuesto, relevo) | `salaStatus`, `presupuestoStatus`, `relevoAviso`, `dealAllSalasLabel` |
| `curation-watchdog.ts` | Veredicto vivo / decadencia / muerto a partir de descargas y fecha | `assessCuration` |
| `local-first.ts` | Paquetes recomendados para trabajo local, con aviso | `LOCAL_FIRST` |
| `memory-policy.ts` | Opt-in de memoria por proyecto (`.alfred-pi/memory-policy.json`) | `loadMemoryPolicy`, `saveMemoryPolicy` |
| `docs-site.ts` | HTML estático desde los markdown públicos; excluye `auditoria/` | `generateDocsSite` |
| `sonar-env.ts` | Escribe `SONAR_URL` y `SONAR_TOKEN` en modo 0600; rechaza permisos más abiertos | `writeSonarEnv` |

## packs/

Once packs con `domain.json` (manifiesto con disparadores y hints),
`context.md` (postura inyectada), `skills/<n>/SKILL.md` y `prompts/<n>.md`.
Los disparadores son datos de enrutado del autopilot.

El término canónico en la documentación es «pack» (ver el glosario de
arquitectura.md); `domain.json`, `domains.ts` y el prefijo `dom:` son
nombres históricos del código y no se renombran.

## test/

Unidad por módulo (`test/curate-turn.test.ts`, `test/prober.test.ts`,
…). Cobertura de ramas en `test/coverage-*.test.ts`. Cubo Siguiente en
`test/siguiente-*.test.ts`. Viajes de TUI en `test/journeys/` con
`helpers/scripted-ui.ts`. Contrato de eventos en
`test/index-contract.test.ts`. Guardianes: cifras públicas, origin y
license, imports de pi, paquetes recomendados vivos.

El preload `test/preload-pi-stubs.ts` (vía `bunfig.toml`) stubbea los
módulos de pi. Mapa y cómo correrlos: [probar.md](probar.md).
