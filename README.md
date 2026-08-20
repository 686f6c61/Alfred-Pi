# Alfred-Pi

**[Read this in English](README.en.md)**

```
   _____ _____      _    _          _____  _   _ ______  _____ _____       __  __  ____  ______ 
 |  __ \_   _|    | |  | |   /\   |  __ \| \ | |  ____|/ ____/ ____|     |  \/  |/ __ \|  ____|
 | |__) || |______| |__| |  /  \  | |__) |  \| | |__  | (___| (___ ______| \  / | |  | | |__   
 |  ___/ | |______|  __  | / /\ \ |  _  /| . ` |  __|  \___ \\___ \______| |\/| | |  | |  __|  
 | |    _| |_     | |  | |/ ____ \| | \ \| |\  | |____ ____) |___) |     | |  | | |__| | |____ 
 |_|   |_____|    |_|  |_/_/    \_\_|  \_\_| \_|______|_____/_____/      |_|  |_|\____/|______|
```

**El centro de control para [pi](https://pi.dev): un harness de producto, no un juguete de terminal.**
Un producto de harness.moe · desarrollado por @686f6c61 · v0.3.0 · MIT · tests con bun · 0 dependencias

## Lo que hay dentro (gratis, MIT)

Un agente de código sin harness es un genio sin casa: talento bruto, cero modales.
pi le da el cimiento (ejecución, herramientas, sesiones). **Alfred-Pi construye
todo lo demás**: proveedores y claves, packs de oficio, presupuesto y relevo. Abres
una carpeta, abres pi, y la casa ya está en marcha.

Nada de configuración paralela ni estados fantasma: el harness gobierna sobre los
archivos nativos de pi, con diff antes de escribir y backup antes de tocar. Lo que
configuras es lo que el agente usa.

**Documentación técnica completa en [docs/](docs/index.md)**: qué es un harness
y cómo funciona pi ([pi.md](docs/pi.md)), arquitectura
([arquitectura.md](docs/arquitectura.md)), comandos y TUI
([comandos.md](docs/comandos.md)), mapa de módulos
([modulos.md](docs/modulos.md)), los 11 packs
([dominios.md](docs/dominios.md)), instalación
([instalacion.md](docs/instalacion.md)), esquemas de datos
([datos-y-config.md](docs/datos-y-config.md)), cómo extender
([extender.md](docs/extender.md)) y cómo probar
([probar.md](docs/probar.md)).
El sitio público es la rama `landing` (en este checkout: carpeta `www/`,
no se sube en `main`). `docs/auditoria/` es taller interno y no se publica.

## Qué hace la casa

1. **El radar (autopilot).** Escribes «audita la seguridad de este repo»
   y la casa elige pack sola: contexto de seguridad inyectado, insignia
   en el pie, skills de auditoría al alcance del modelo. 11 packs,
   52 skills, 26 prompts, cero menús.
2. **El guardián del presupuesto.** Tope $/día: aviso al 80 %, modo
   frugalidad al 100 %. Lee tus sesiones locales y te avisa; no te corta ni
   envía datos a ningún sitio.
3. **El relevo.** Dos fallos del proveedor activo (HTTP o transporte) y la
   pila salta al siguiente eslabón sano antes del próximo turno. Nunca en
   mitad de un stream.
4. **La auditoría de paquetes.** En `/essentials` se examinan las fuentes
   antes de instalar. El buscador `/packages` se alinea. Informa, tú decides.
5. **Proveedores y claves.** 22 presets (Grok, Kimi, Codex, Claude, GLM,
   Ollama local y Cloud, LM Studio, vLLM...). El local no es un recoveco:
   es un preset de primera. Claves con máscara, referencias `$ENV`, doctor
   con latencia real.
6. **Alfred (opcional).** Educación e ironía; los datos técnicos van sin
   adorno. Se despide con `/persona`.

## Por qué esta casa (una explicación)

El harness, cortado como un edificio, solo para situar: tú mandas, pi ejecuta,
y entre medias hay packs, presupuesto y proveedores. La tabla de comandos no
usa esta metáfora.

Detalle técnico en [docs/arquitectura.md](docs/arquitectura.md); el anfitrión
pi, en [docs/pi.md](docs/pi.md).

```
              ┌───────────────────────────────────────────────┐
              │                 TÚ MANDAS                    │
              └───────────────────────┬───────────────────────┘
                                      │ escribe / pide
 ╔════════════════════════════════════╪═══════════════════════════════════╗
 ║  PERSONA          Alfred, opcional. Cortesía con colmillo técnico.     ║
 ╠═══════════════════════════════════════════════════════════════════════╣
 ║  PACKS / RADAR    Un pack por turno. Skills de todos los packs en el   ║
 ║                   menú. Prompts ES/EN.                                 ║
 ╠═══════════════════════════════════════════════════════════════════════╣
 ║  PRESUPUESTO      Doctor, tope diario, auditoría de paquetes.          ║
 ╠═══════════════════════════════════════════════════════════════════════╣
 ║  PROVEEDORES      Modelos y claves. Escrituras con diff, backup y      ║
 ║                   atómica. Relevo entre turnos. Local incluido.        ║
 ╚═══════════════════════════════════╤═══════════════════════════════════╝
                                     │
              ┌──────────────────────┴──────────────────────┐
              │        PI, EL CIMIENTO (el harness base)    │
              │  loop del agente · tools · sesiones · jiti  │
              └─────────────────────────────────────────────┘
```

Un turno, en cuatro frases: tú escribes; el radar elige pack y el presupuesto
revisa la caja; el modelo decide con el menú de skills y el contexto del pack;
la casa actualiza el pie y anota la salud. Si un eslabón falla, se cura entre
turnos, nunca en mitad del baile.

## Instalación

Guía exhaustiva, con desinstalación y reinstalación, en [docs/instalacion.md](docs/instalacion.md).

```sh
# vía canónica
pi install git:github.com/686f6c61/Alfred-Pi

# o probar sin instalar nada
pi -e git:github.com/686f6c61/Alfred-Pi
```

Requiere [pi](https://pi.dev) 0.84 o superior. Actualizar: `pi update --all`.
Desinstalar: `pi remove git:github.com/686f6c61/Alfred-Pi` (tu
configuración es tuya).

## Primeros cinco minutos

Si es tu primera vez, pi abre el **asistente de primer arranque**: preset,
clave, sonda, modelo por defecto, radar y presupuesto. Acepta lo que te sirva
y pide en tu idioma.

El guardián del presupuesto lee tus sesiones locales y te avisa; no te corta
ni envía datos a ningún sitio.

Si ya pasaste o saltaste: `/providers` para tu modelo (nube o local) y
`/autopilot` para el radar. Las skills nuevas piden `/reload`.

Opcional del primer día: `/essentials` (paridad con los agentes grandes, con
auditoría), `/usage` para el presupuesto, `/profile` para una pila con relevo,
`/ollama` para tus modelos.

## Comandos

| Comando | Para qué |
|---|---|
| `/providers` | Proveedores, modelos, claves, valores por defecto, backups |
| `/autopilot` | El radar: elige un pack por turno |
| `/persona` | Alfred o neutral |
| `/domains` | Packs por proyecto o globales |
| `/profile` | Perfiles con relevo |
| `/essentials` | Paridad con los agentes grandes (paquetes curados, auditados) |
| `/packages` | Buscador del ecosistema. Auditoría en esenciales; el buscador se alinea. |
| `/usage` | Coste y presupuesto diario |
| `/ollama` | Modelos locales y de nube |
| `/stack` | Estado de la casa de un vistazo |
| `/providers:doctor` | El doctor revisa proveedores y configuración |

Headless: `pi --alfred-pi=doctor` y `pi --alfred-pi=usage` (también
`stack`, `autopilot` y `domains`; variantes `:json`). Referencia:
[docs/comandos.md](docs/comandos.md).

## Packs de trabajo

Referencia completa con casos de uso de cada pack en [docs/dominios.md](docs/dominios.md).

| Pack | Skills | Prompts |
|---|---|---|
| **Seguridad** | threat-modeling, owasp-review, sonarqube-audit, secret-scanning, dependency-audit | `/audit` `/threat-model` `/sonar` `/fix-findings` |
| **Agentes IA** | agent-orchestration (fan-out, presupuestos, protocolo de merge) | `/fanout` |
| **Docs** | documentation (Diátaxis), adr, api-reference | `/adr` `/docs-audit` |
| **Escritura (ES)** | rae-normas, traduccion-en-es | `/revision-es` |
| **Código limpio** | solid-review, refactoring-patterns, tdd-workflow, pr-review-checklist, tech-debt-inventory, ddd-architecture | `/review-clean` `/refactor` |
| **Web / fullstack** | api-design, http-service, app-persistence, async-jobs, e2e-testing, browser-improve, astro-development, visual-guides, web-performance, frontend-security, i18n-l10n, release-gate | `/review-api` `/scaffold-crud` `/guide` |
| **Compliance** | privacy-review, license-compliance, a11y-audit | `/privacy-check` `/a11y-audit` |
| **Landing design** | landing-copy, visual-critique (visión), conversion-checklist, design-systems, ab-testing, seo-analytics | `/landing-review` `/landing-from-image` |
| **DevOps / infra** | docker-workflow, github-actions, incident-triage, kubernetes-triage, observabilidad, db-ops | `/ci` `/diagnose-502` `/infra-audit` |
| **Data / análisis** | sql-optimization, pandas-analysis, dashboard-design, data-quality | `/query-review` `/explore` `/dashboard` |
| **QA / testing** | test-strategy, fixtures-factories, contract-testing, flaky-hunting | `/test-plan` `/flaky` `/coverage-gaps` |

Habilitar por proyecto o en global; al deshabilitar solo se retiran los enlaces
creados por la casa. Normas de la casa: español RAE, cero emojis, sin raya
dentro de las frases.

## Datos y configuración

Esquemas campo a campo en [docs/datos-y-config.md](docs/datos-y-config.md).

Todo vive en archivos nativos de pi (`~/.pi/agent/models.json`, `auth.json`,
`settings.json`) más el estado propio en `~/.pi/agent/alfred-pi/`
(perfiles, autopilot, presupuesto, salud, backups). Qué datos se tratan, con
qué finalidad, dónde residen y cómo se borran: [nota de privacidad
técnica](docs/datos-y-config.md#nota-de-privacidad-técnica).

## Seguridad

Cero dependencias en runtime; claves siempre enmascaradas; escrituras con diff,
backup y atómica; auditoría pre-instalación advisory en esenciales; salida de
red acotada a lo que tú disparas. Política completa en [SECURITY.md](SECURITY.md).

## Desarrollo

Mapa de módulos en [docs/modulos.md](docs/modulos.md). Cómo extender:
[docs/extender.md](docs/extender.md). Cómo probar:
[docs/probar.md](docs/probar.md).

```sh
bun test                                   # sin necesidad de pi; cifra del árbol, no un 91 copiado
pi --alfred-pi=doctor --no-session -p ok # smoke headless
```

`lib/` es Node puro; `screens.ts` y `onboarding-flow.ts` pueden importar
pi; `index.ts` es el adaptador. Guía corta en
[CONTRIBUTING.md](CONTRIBUTING.md).

## Hoja de ruta

Publicación en npm para la galería pi.dev. El ruteo automático por coste no
entra: el presupuesto informa y el relevo salta por fallo, no por precio.

## Licencia

MIT. 686f6c61 es «hola» en hexadecimal: el origen del nombre de la casa.
