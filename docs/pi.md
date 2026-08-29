# pi: el anfitrión

## Qué es un harness

En agentes de IA, un **harness** es el armazón que rodea al modelo y lo
convierte en herramienta de trabajo: gestiona el bucle de conversación,
expone las herramientas (leer, escribir, ejecutar), ensambla el contexto,
persiste las sesiones y administra modelos y credenciales. La división del
trabajo es simple: **el modelo piensa; el harness ejecuta**. El motor sin
chasis no se conduce; el chasis sin motor no arranca.

Dicho en clave de producto: un harness es todo lo que hay entre tu teclado
y el modelo. Pi decide qué harness es: el tuyo.

Hay dos clases en la práctica. El **harness base o runtime** (el bucle, las
tools, las sesiones) y la **capa de harness de producto** que convierte el
runtime en algo gobernable: control de proveedores, dominios de trabajo,
seguridad, coste, personalidad. pi es deliberadamente minimalista en la
primera capa y abierta en la segunda: casi todo llega por extensiones.
Alfred-Pi es esa segunda capa completa: un harness de producto sobre
el harness base.

No se puede documentar un harness sin entender el anfitrión que lo aloja.
Este documento explica pi con el nivel de detalle que el resto de la
documentación asume.

## Qué es pi

pi es un agente de código deliberadamente mínimo: un runtime de agente con
pocas opiniones y un sistema de extensiones como única vía de crecimiento.
Su apuesta: el núcleo ejecuta bien el bucle esencial (hablar con un modelo,
usar herramientas, mantener la conversación) y todo lo demás, desde
subagentes hasta interfaces, lo aporta quien quiera vía extensiones.

Piensa en pi como el kernel: planifica, ejecuta herramientas y persiste
sesiones. Alfred-Pi es el resto del sistema operativo.

## El bucle del agente

```
   entrada del usuario
          │
          ▼
 ┌─────────────────────┐        no ┌──────────────┐
 │ ¿hay más contexto?  │──────────▶│ fin de turno │
 └─────────┬───────────┘           └──────────────┘
           │ sí
           ▼
 ┌──────────────────────────────────────────────┐
 │ 1. before_agent_start (extensiones)          │
 │    reescribir system prompt / inyectar msg   │
 ├──────────────────────────────────────────────┤
 │ 2. petición al proveedor (system + mensajes) │
 │    hooks: before_provider_headers/request    │
 ├──────────────────────────────────────────────┤
 │ 3. ¿la respuesta pide herramientas?          │
 │    sí → ejecutar tool (read/write/edit/bash) │
 │         → tool_call / tool_result hooks      │
 │         → volver a 2 con los resultados      │
 │    no → mensaje final del asistente          │
 ├──────────────────────────────────────────────┤
 │ 4. turn_end (salud del proveedor)            │
 │ 5. agent_settled / fin de turno              │
 └──────────────────────────────────────────────┘
```

Cada vuelta por el cuadro es un turno compuesto por varios ciclos de
herramientas. Las extensiones pueden engancharse en cada fase numerada.

## Herramientas base

`read`, `write`, `edit` y `bash` forman el juego mínimo; `grep`, `find` y
`ls` son opciones de solo lectura. No hay subagentes, plan mode, permisos ni
MCP en el núcleo: todas esas capacidades llegan como paquetes de extensión
(pi-subagents, pi-plan-mode, pi-permission-system, pi-mcp-adapter). Esa
sequedad es la razón de ser del harness: decidir qué casa construir sobre
el cimiento.

## Sesiones: árbol en JSONL

Cada sesión es un archivo JSONL en `~/.pi/agent/sessions/`, agrupado por
directorio de trabajo codificado. Tipos de entrada que interesan al harness:

| Entrada | Campos usados |
|---|---|
| `session` | `id`, `cwd`, `timestamp` |
| `model_change` | `provider`, `modelId` |
| `message` (asistente) | `provider`, `model`, `usage {input, output, cacheRead, cacheWrite, reasoning}` |

El árbol de sesión permite bifurcar (`/tree`), exportar y compartir. El
harness solo lee estos archivos: uso, coste y presupuesto se calculan sin
tocar una sola línea de ellos.

## Extensiones: el contrato

pi carga TypeScript directamente con jiti, sin paso de build:

```
~/.pi/agent/extensions/*.ts            globales (un archivo)
~/.pi/agent/extensions/<dir>/index.ts  globales (paquete)
.pi/extensions/...                     de proyecto (si el proyecto es de confianza)
pi -e <ruta|url>                       ad hoc, una sesión
```

Dentro del proceso, pi aliasa `@earendil-works/pi-tui` y
`@earendil-works/pi-coding-agent` para que la extensión importe tipos y
componentes de TUI sin instalar nada. Por eso en este repo esos imports
solo existen en `index.ts`, `lib/screens.ts` y
`lib/onboarding-flow.ts`: el resto de `lib/` es Node puro y corre
(y se testea) sin agente.

El punto de entrada exporta por defecto una fábrica:

```ts
export default function (pi: ExtensionAPI): void { ... }
```

Y desde ahí: `registerCommand`, `registerFlag`, `on(evento, handler)`,
`setModel`, `exec`, y el contexto (`ctx.ui`, `ctx.modelRegistry`,
`ctx.cwd`, `ctx.mode`) que llega a cada handler. Un detalle que costó un
bug real: los handlers de comando reciben `(args: string, ctx)`, no
`(ctx)`; el primer parámetro son los argumentos del comando.

Este harness engancha cuatro eventos (`session_start`,
`before_agent_start`, `turn_end`, `model_select`). No
engancha `tool_call`, `tool_result` ni `agent_settled`: el núcleo de pi
sigue ejecutando herramientas; la capa de producto actúa en los bordes
del turno. Detalle en [arquitectura.md](arquitectura.md) y
[comandos.md](comandos.md).

Los únicos ficheros de este repo que importan paquetes de pi son
`index.ts`, `lib/screens.ts` y `lib/onboarding-flow.ts`. El resto de
`lib/` es Node puro.

## Contexto del agente

En cada arranque pi ensambla el system prompt: su base de agente de código,
más el archivo `AGENTS.md` global (`~/.pi/agent/`, con fallbacks
`AGENTS.override.md` y `CLAUDE.md`) y el del proyecto, más el menú de
skills descubiertas en `~/.pi/agent/skills/` y `.pi/skills/`. Los prompts
de plantilla viven en `prompts/` equivalentes. El harness añade su capa:
contexto del pack activo, persona y notas de presupuesto.

## Modelos y proveedores

Tres archivos gobiernan la identidad del agente:

- `models.json`: proveedores personalizados (baseUrl, api, modelos,
  compatibilidades).
- `auth.json`: credenciales de proveedores integrados (0600).
- `settings.json`: defaults y paquetes instalados.

El registro de modelos se recarga al usarlo; el harness llama a
`modelRegistry.refresh()` tras cada escritura para que los cambios apliquen
sin reiniciar. Un matiz fino descubierto en la práctica: para modelos de
razonamiento, pi envía el system prompt con rol `developer` (convención
OpenAI moderna) y algunos backends compatibles lo descartan entero; el
campo `compat.supportsDeveloperRole: false` fuerza el rol `system`. El
doctor del harness sondea esto en vivo.

## Modos de ejecución

| Modo | Uso | El harness en él |
|---|---|---|
| TUI interactivo | uso diario | pantallas completas, statusline, cabecera |
| Print (`pi -p`) | scripts y CI | doctor/usage headless vía `--alfred-pi` (alias `--harness-moe`) |
| RPC (JSONL por stdio) | control programático | eventos y UI de diálogo proxificados |
| SDK | embeber | no usado por el harness |

## Gestión de paquetes

```sh
pi install git:github.com/user/repo@tag   # desde cualquier repo git
pi install npm:paquete                    # desde npm (keyword pi-package)
pi update --all                           # actualizar todo
pi remove <fuente>                        # retirar
```

La instalación añade la fuente a `packages` en settings.json y baja el
árbol al almacén de pi. Este harness se distribuye por la vía git con
etiqueta.
