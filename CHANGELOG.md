# Changelog

## 0.5.0 (en preparación)

### Corregido

- **El relevo no llegaba a dispararse nunca.** El conteo de fallos vivía en
  `after_provider_response`, y pi solo emite ese evento cuando hay respuesta
  HTTP: un rechazo de conexión, un DNS, un timeout o un 5xx nunca llegan a
  él, así que el contador no pasaba de cero y el relevo era inalcanzable
  (verificado contra pi 0.84.3 con un proveedor real caído). El conteo pasa
  a `turn_end`, que sí se emite en todo cierre de turno: `stopReason:
  "error"` cuenta (HTTP o transporte por igual), `aborted` es neutro y el
  resto limpia la racha. Nueva guard `fallback-turn-outcome.test.ts` para
  que el conteo no vuelva a cablearse a un evento que no ve fallos.
- `--alfred-pi=autopilot` y `domains` imprimen texto legible; el sufijo
  `:json` da el objeto para máquinas, como ya hacía `stack` y como
  prometía `docs/comandos.md`. Antes ambas variantes imprimían el mismo
  JSON crudo.
- `recordTransportFailure` y `classifyTransportFailure` eran código muerto
  (nadie los invocaba en runtime); se retiran junto a `recordResponse`.

### Proveedores

- Ocho presets nuevos: Google Gemini (AI Studio, con sonda por
  `x-goog-api-key`), Alibaba Qwen (Model Studio), MiniMax, NVIDIA NIM,
  Perplexity, Hugging Face Router, Azure OpenAI (con cabecera `api-key` y
  URL de recurso editable) y Amazon Bedrock (vía gateway LiteLLM).
  Con ellos, el catálogo llega a 30 presets; los presets pueden llevar
  cabeceras propias resueltas desde `$ENV`.
- Importación de OpenCode ampliada con alias para todos ellos.

### Onboarding

- Importación de credenciales de OpenCode en el primer arranque: el asistente
  encuentra TODOS los servidores con clave (aunque OpenCode no guarde su URL:
  se pide con sugerencia, p. ej. Zen), los muestra enmascarados y los importa
  con una confirmación; los que casan con preset se montan solos y los custom
  traen su baseURL. Sonda por servidor incluida. La fuente es inyectable
  (`import-sources.ts`, Node puro) para añadir otras herramientas después.
- Multiplataforma de verdad: se comprueban XDG (Linux/macOS) y
  `AppData/Roaming` (Windows), con `os.homedir()`. En agent dirs aislados
  (`PI_CODING_AGENT_DIR`) la importación no se ofrece.
- Pasarelas y servidor propio (OpenRouter, LiteLLM, custom) preguntan su URL
  base, con validación y consentimiento de origen: Bedrock, Azure o cualquier
  gateway OpenAI-compatible se configuran sin tocar ficheros.

### Documentación

- README ES/EN: la frase del sitio público ya no dice que `www/` está en
  este checkout (vive en la rama `landing`; `main` solo guarda el HTML
  plano de respaldo en `site/`). La sección de seguridad nombra el host
  del canal de actualizaciones (`pi.686f6c61.dev`), que ya estaba en la
  nota de privacidad.
- `package.json` pierde los scripts `docs:site*`: apuntaban a `www/`, que
  no existe en `main`, y fallaban en cualquier checkout.
- `arquitectura.md`, `pi.md`, `modulos.md`, `probar.md` y `comandos.md`
  reflejan el nuevo evento de conteo y el reparto texto/JSON del flag.

## 0.4.0

### Packs

- `clean-code` recomienda `@dietrichgebert/ponytail` (escalera YAGNI:
  stdlib y dependencias antes de inventar). Inyecta reglas cada turno;
  aviso en el contexto del pack; instalación solo por `/packages`.
- `qa-testing` gana `bug-repro-loop`: mando rojo de un bug duro (comando
  que ya falló, hipótesis, prueba de regresión). No es un 502 ni un flake.
- `ai-agents` gana `/implement` y el patrón DAG con frontera (un worktree
  por escritor, un colector). Si no hay aristas bloqueantes, sigue
  `/fanout`.
- `pr-review-checklist` gana el eje Spec (fidelidad al encargo, distinto
  de la corrección).
- El catálogo pasa a 53 skills y 27 prompts. Siguen once packs.
- Se retiran del árbol los directorios vacíos `docker-hardening` y
  `hardening-checklist`, herencia de dos fusiones anteriores.

### Harness

- Esenciales: `pi-context-view` (`/context`, mapa de contexto sin
  inyectar instrucciones) y `@narumitw/pi-btw` (`/btw`, hilo al margen).
- `--alfred-pi=usage:N` acota el informe a los últimos N días. El parser
  del rango existía desde 0.3.0, pero la guarda del valor lo dejaba
  inalcanzable; ahora responde y tiene caso en el viaje headless.
- La TUI deja de ofrecer referencias `!comando` al pedir una clave. El
  resolutor siempre las rechazó, así que la etiqueta invitaba a guardar
  una credencial que jamás resolvería.

### Documentación

- Pasada de contraste de los diez documentos de `docs/` y los dos README
  contra el código 0.4.0. Se corrigen la frontera de `lib/` (falta
  `onboarding-flow.ts` como importador de pi), el diagrama de arranque, el
  contrato de frontmatter de los prompts y el manifiesto de pack.
- La nota de privacidad y el apartado de seguridad dejan de decir que la
  única salida de red es la que dispara el usuario: se nombran models.dev,
  el registro de npm y el canal de actualizaciones.

### Sitio

- Cifras 53/27 en casa, changelog, `llms.txt` y las imágenes de compartir.
- `llms.txt` y `llms.es.txt` dejan de ser una ficha de viñetas y pasan a
  brief de producto: desambiguación de nombres, superficie de comandos,
  las once salas con su disparador, los cinco mecanismos, qué sale a la
  red y una lista expresa de lo que el producto no hace.
- Docs técnicos reescritos en compilación: los enlaces `.md` ya no
  dependen de JavaScript y las tablas anchas van envueltas.
- Accesibilidad y paridad: enlace de salto, contraste de texto, encabezados,
  gutter bilingüe, FAQ inglesa a la par y una sola fuente para el JSON-LD.

## 0.3.0

### El nombre

pi-harness-moe pasa a llamarse Alfred-Pi en público: npm `alfred-pi`,
flag headless `--alfred-pi` (con `--harness-moe` como alias que avisa
durante un ciclo), directorio de estado `~/.pi/agent/alfred-pi/` y
statusline `alfred` / `alfred-sala` / `alfred-presupuesto`. Alfred es
la casa; pi sigue siendo el anfitrión y harness.moe el estudio. Una
instalación 0.2.x encuentra su estado tras actualizar: el primer
arranque copia el directorio viejo al nuevo y deja constancia en
`migrated-from.json`. El repositorio de GitHub pasa a
`686f6c61/Alfred-Pi`; las URL de instalación apuntan ahí. No se
publica npm en este cubo.

### El sitio

Nace la documentación en Astro, bilingüe (español en `/`, inglés en
`/en/`), hecha a medida por el estudio. Importa los `docs/` públicos
como colección en lugar de duplicarlos. Las salas se explican en
prosa, la FAQ responde preguntas reales y `docs/auditoria/` sigue sin
publicarse. El generador HTML plano deja de ser la cara pública;
`site/manifest.json` se conserva como canal de actualizaciones. El
sitio publica mapa del sitio con hreflang, robots, imagen para
compartir (Open Graph y Twitter) y datos estructurados.

### Cubo Ahora

La casa de siempre, asentada: gobierno de proveedores y claves sobre
los archivos nativos de pi, doctor con sondas reales, asistente de
primer arranque y el escudo de escrituras (plan, diff, backup,
atómica).

### Cubo Siguiente

Intenciones, esenciales por tramo, watchdog, memoria opt-in, local
first y la lengua de casa (pack, paquete, turno, presupuesto, relevo,
clave, perfil). El presupuesto lee sesiones locales, avisa y no corta.
El relevo salta por fallo, no por precio.

### Packs

- Profundizado `web-fullstack` (siguen 11 packs): skills `http-service`,
  `app-persistence`, `async-jobs` y `browser-improve`. Capturas y SEO no
  se clonan; `seo-analytics` gana límites y `visual-guides` gana anti-patrones.
  El catálogo pasa a 52 skills. El directorio vacío `deploy-checklist` se
  retira.
- Reescritas las skills de seguridad web y fullstack de la oleada S-SKL-W1.
  `release-gate` sustituye las listas gemelas de endurecimiento y despliegue,
  aporta evidencia ejecutable y reduce el catálogo a 49 skills. Los contexts
  de ambos packs pasan de lemas a restricciones verificables.
- Reescritas las skills de conversión, copy y crítica visual de
  `landing-design`. `docker-workflow` absorbe el endurecimiento de contenedores,
  se retira su gemela y el catálogo queda en 48 skills. Las skills operativas
  de DevOps ganan verificaciones, formatos y límites sin duplicar su oficio.
- Reescritas las skills de dashboard, calidad de datos, estrategia de pruebas,
  factorías y traducción de la oleada S-SKL-W4. `pandas-analysis` gana una
  puerta de revisión acotada; los contexts de datos y agentes pierden metáforas
  y comprimen sus restricciones sin crear skills nuevas.
- Recomendados reauditados en npm: devops gana `@danypops/pi-pipes`, QA
  gana `tdd-enforcer`, clean-code gana `@plannotator/pi-extension` y
  ai-agents gana `pi-memory` (aviso de secretos; solo por `/packages`).
  Compliance sigue sin recomendados. Test guardián impide resucitar los
  seis paquetes muertos de N-PCK-01.

### Docs

- Documentación pública en Astro (`www/`), bilingüe. `docs/auditoria/`
  no entra. `bun run docs:site` construye `www/dist/`.
- Mapa de desarrollador: `comandos.md`, `extender.md` y `probar.md`.
  Arquitectura documenta `curateTurn`, sala, intenciones, memoria opt-in
  y watchdog. `modulos.md` lista los siete módulos del cubo Siguiente.
  `instalacion.md` deja de ofrecer `!comando` (el harness lo rechaza).
  `dominios.md` pasa a «Packs de trabajo» y describe el manifiesto.
- Cifras públicas (tests, packs, skills, prompts, presets) salen del árbol;
  el README deja de copiar una cifra muerta.
- Lengua pública: pack, paquete, turno, presupuesto, relevo, clave, perfil.
  El local no se llama sótano. La mansión queda como explicación, no como
  menú de comandos.
- Primeros minutos: el asistente de primer arranque, no solo `/providers`
  y `/reload`.
- Auditoría en esenciales; el buscador `/packages` se alinea (N-ESC-02).
- El guardián del presupuesto explica en el primer arranque y en su ficha que
  lee las sesiones locales y avisa, sin cortar ni enviar datos a ningún sitio
  (P-28).

## 0.2.0

### Domain expansion

- 22 new skills: 15 across existing packs (secret-scanning, dependency-audit,
  api-reference, traduccion-en-es, web-performance, frontend-security,
  ab-testing, seo-analytics, kubernetes-triage, observabilidad, db-ops,
  pr-review-checklist, tech-debt-inventory, ddd-architecture plus the
  earlier design-systems) and the /fix-findings prompt.
- Two new packs: data-analisis (sql-optimization, pandas-analysis,
  dashboard-design, data-quality; /query-review /explore /dashboard) and
  qa-testing (test-strategy, fixtures-factories, contract-testing,
  flaky-hunting; /test-plan /flaky /coverage-gaps). Totals: 11 packs, 49
  skills, 26 prompts.

### Product depth

- Headless modes --harness-moe=stack|autopilot|domains with :json output;
  stack info extracted to lib/stack.ts so TUI and headless share source.
- Provider error classifier (cause, action, retry policy) behind the
  doctor and failover notes instead of bare status codes.
- First-run onboarding wizard (guided preset, key, probe, default,
  autopilot, budget) when no providers are configured; dismissable, never
  repeats.
- Community integrations recommended per pack: -tech/pi-changelog,
  @narumitw/pi-github-pr, pi-secrets-guard, @testzugang/pi-dependency-audit.

## 0.1.0

Initial release.
### Provider control center (`/providers`)

- Full TUI over pi's native `models.json`, `auth.json` and `settings.json`
  no parallel config, no drift.
- Safe writes: unified-diff preview (colored), atomic writes, automatic
  timestamped backups (retention 10, pinnable, restorable), live reload
  without restarting pi.
- Wizard with 22 provider presets: xAI Grok / Grok Code, Moonshot Kimi
  (OpenAI + Anthropic-compatible), OpenAI Codex (Responses API), Anthropic
  Claude, z.ai GLM (API + Coding Plan), Ollama Cloud (remote `/v1`),
  OpenRouter, DeepSeek, Groq, Together, Mistral, Cerebras, Fireworks, and own
  inference servers (Ollama, LM Studio, vLLM, SGLang, LiteLLM, or any custom
  OpenAI-compatible server).
- Model discovery via `GET /models` with a multi-select checklist; manual
  entries always survive re-discovery.
- Metadata autofill from models.dev (context window, output limit, reasoning,
  vision, $/M pricing - ollama `:cloud` models included); fills only missing
  fields, 24h cache, silent offline degradation.
- Keys with hygiene: literals, `$ENV_VAR`, `!command` refreshers; masked
  display; inline resolution check.
- Defaults management with live session switch (`setModel` + thinking level).

### Doctor

- Free liveness probes per provider (latency + model list), actionable errors
  (auth vs quota vs URL), deep 1-token probes on demand.
- Config reconciliation: trailing slashes, missing api types, stale defaults,
  unset `$ENV`, broken `!command`, duplicate model ids.
- Health history in `~/.pi/agent/pi-harness-moe/health.jsonl` with per-provider
  success rate and latency.
- Headless: `pi --harness-moe=doctor`.

### Profiles & auto-fallback (`/profile`)

- Named model stacks - ordered `{provider, model, thinkingLevel?}` chains;
  applying picks the first step that resolves.
- Auto-fallback: after 2 consecutive provider failures on the active model,
  switches to the next healthy step before the next turn (between turns only,
  counters reset on success).

### Autopilot (`/autopilot`)

- Per-turn domain detection cascade: prompt triggers (Spanish and English,
  word-boundary scoring, long triggers weigh more) → repo hints (Dockerfile
  → devops, sonar config → security, astro config → web…) → sticky last
  domain for follow-up turns. Focused context injection - only the detected
  domain's context goes into the system prompt, statusline shows the `dom:` badge.
- Optional `context+thinking` routing applies the domain's recommended
  thinking level per turn.
- "Deal all cards": one action enables every pack's skills and prompts;
  autopilot focuses contexts, the model keeps the full skills menu.
- Off by default; manual stacked-context mode remains the default behavior.

### Domain packs (`/domains`)

- Themed work-area bundles of skills, prompt templates, injected system-prompt
  context and a recommended model posture.
- Nine packs: security (incl. SonarQube audits on a local Docker server),
  **ai agents** (orchestration patterns, role/model assignment, budgets,
  /fanout), **docs** (Diátaxis structure, ADRs, /docs-audit), **escritura
  ES** (RAE orthography reference, /revision-es, zero-emoji policy), clean
  code, web/fullstack (incl. Astro and visual step-by-step guides with
  screenshots), compliance (privacy, licensing, a11y), landing design
  (vision critique), devops/infra (incl. docker workflow, GitHub Actions CI
  with trusted publishing, and hardening).
- Emoji-free by policy: interface, docs and output use typographic symbols
  only (typographic marks such as checkmarks are not emojis); no emojis
  anywhere unless explicitly requested.
- Enable per project or globally via symlinks with strict ownership checks
  disabling removes only links this extension created.
- Recommended community packages per pack (e.g. pi-sonar, piolium,
  pi-browser-harness, the Astro docs MCP) shown in the TUI with manual
  install commands.

### Essentials with security audit (`/essentials`)

- Curated parity packages (MCP adapter, subagents, plan mode, permissions,
  web access, todos, LSP feedback, powerline footer) with one-shot
  "install all missing". Nothing installs silently.
- Pre-install security audit: fetches the package's public sources and scans
  for risky patterns - fetch-and-execute, credential exfiltration, decoded
  payloads feeding eval, pipe-to-shell installers, whole-env serialization,
  minified network bundles - plus the network endpoints it references.

### Usage & cost (`/usage`)

- Offline, ccusage-style reports per model, day and top sessions, parsed from
  local session JSONL files; pricing from models.json `cost` fields (or
  autofill); unpriced models flagged. Headless: `pi --harness-moe=usage`.

### Ollama manager (`/ollama`)

- Talks to the local ollama server API directly: installed models (local +
  `:cloud` side by side), running processes, pull with live progress, remove,
  one-key register into pi (cloud models get `_launch`).

### Package browser & security audit (`/packages`)

- Search the whole pi ecosystem (npm, keyword `pi-package`) with monthly
  downloads, package details (version, license, readme), one-key install.
- Security audit before installing - for npm sources (fetched via unpkg) and
  **git sources** (shallow-cloned into a temp dir): fetch-and-execute,
  credential exfiltration, decoded payloads feeding eval, pipe-to-shell
  installers, whole-env serialization, minified network bundles, plus the
  network endpoints referenced.

### Stack (`/stack`)

- Control tower: active model + thinking, defaults, autopilot state + last
  detected domain, auto-fallback profile, enabled domains and available
  skills/prompts, installed packages, daily budget and per-provider health.

### Daily budget guard

- Set a max USD/day in `/usage` - the statusline shows budget usage, warns at
  80% (once per day), and at 100% injects a frugality note into the system
  prompt (tight answers, no fleet launches without asking). Observes and
  nudges; never silently blocks.

### Project documentation

- Technical documentation under `docs/`: architecture, modules, domains,
  install, data and config. Architecture decisions are kept outside the
  repo, not as in-tree ADRs.
- CONTRIBUTING.md (setup, ground rules, how to add packs/presets) and
  SECURITY.md (policy, what we commit to, explicit non-goals).

### Persona and startup header

- Startup header in the TUI: "pi-harness-moe · un producto de harness.moe ·
  desarrollado por @686f6c61" plus a two-line pitch with the version.
- Response persona Alfred by default (polite, dry sarcasm serving clarity,
  absolute technical precision); `/persona` switches Alfred/neutral. Dual
  vehicle: appended system prompt plus a hidden first-turn conversation
  message, because weak-adherence models ignore late system additions.

### System-role diagnostics

- Root-caused and fixed: OpenAI-compatible backends (ollama with some
  models, other proxies) silently drop "developer"-role messages. pi sends
  reasoning models' system prompt with that role, so the whole system prompt
  (pi base, personas, domains, budget notes) never reached the model.
  Fix: compat.supportsDeveloperRole=false (applied to presets for ollama,
  ollama-cloud, lmstudio, vllm, sglang, litellm, and new ollama
  registrations).
- Doctor now probes this live (two ~10-token completions) and warns with the
  exact fix when a reasoning model behind such a backend lacks the flag.

### Platform

- Statusline segment with active model and auth state.
- Zero runtime dependencies; pure-Node `lib/` modules; unit tests + CI
  (GitHub Actions: tests + headless doctor smoke + command-dispatch
  regression).
