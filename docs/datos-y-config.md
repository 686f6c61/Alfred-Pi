# Datos y configuración

## Archivos nativos de pi (gestionados con diff, backup y escritura atómica)

### ~/.pi/agent/models.json

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": { "supportsDeveloperRole": false },
      "models": [
        {
          "id": "glm-5.2:cloud",
          "contextWindow": 1000000,
          "maxTokens": 131072,
          "reasoning": true,
          "input": ["text"],
          "_launch": true,
          "cost": { "input": 0.6, "output": 2.2, "cacheRead": 0.11 }
        }
      ]
    }
  }
}
```

| Campo | Significado |
|---|---|
| `api` | `openai-completions` · `openai-responses` · `anthropic-messages` · `google-generative-ai` |
| `apiKey` | literal o `$ENV_VAR`; las referencias `!comando` se rechazan |
| `compat.supportsDeveloperRole` | `false` si el backend descarta el rol developer (la sonda del doctor lo detecta) |
| `models[].cost` | $/M tokens: input, output, cacheRead, cacheWrite; alimenta usage y presupuesto |
| `models[]._launch` | marca de Ollama para modelos de nube `:cloud` |

### ~/.pi/agent/auth.json

Credenciales de proveedores integrados: `{ "anthropic": { "type":
"api_key", "key": "$ANTHROPIC_API_KEY" } }`. Permiso 0600 conservado en
cada escritura.

Regla de ubicación: las claves de proveedores personalizados viven en
`models.json`; las de proveedores integrados viven en `auth.json`. `auth.json`
se escribe siempre con permiso 0600. `models.json` también se escribe con 0600
si contiene una clave literal o una cabecera de autorización literal; una
referencia `$ENV` no se considera un secreto almacenado.

Un proveedor con `baseUrl` lleva `credentialPolicy.authorizedOrigin`
(origen que el usuario confirmó). Un host hostil o un cambio de origen
sin nueva aprobación no resuelve la clave. El loopback HTTP se pide
aparte (`allowInsecureLoopback`).

### ~/.pi/agent/settings.json

`defaultProvider`, `defaultModel`, `defaultThinkingLevel` y `packages`
(fuentes instaladas, incluida la de este harness).

## Estado propio: ~/.pi/agent/alfred-pi/

| Archivo | Contenido |
|---|---|
| `profiles.json` | `{ profiles: [{ name, description?, chain: [{provider, model, thinkingLevel?}] }] }` |
| `autopilot.json` | `enabled`, `routing` (`context` o `context+thinking`), `enabledAt`, `lastDomainId`, `lastDomainAt` |
| `fallback.json` | `activeProfile`, `failures` por `provider/model`, `previousModel` (el que se dejó al saltar) |
| `budget.json` | `dailyMaxUsd`, `warnedOn`, `criticalOn` (día ISO del último aviso por nivel) |
| `domains.json` | `enabled[<id>]`: alcance (`agent` o `project`), `repoRoot`, listas de symlinks de skills y prompts, `enabledAt` |
| `persona.json` | Voz activa (`alfred` o `none`) |
| `onboarding.json` | `done`, `status` (`in_progress` / `completed` / `deferred` / `blocked`), `blockedReason`, `completedSteps` |
| `health.jsonl` | Una línea por sonda: `{at, provider, ok, latencyMs, error}` |
| `audit-receipts/` | Recibo inmutable por `nombre@version` de una auditoría de paquete |
| `backups/` | Copias completas y sin redacción, con `backup.json` |
| `update-cache.json`, `catalog-cache.json` | Cachés de 24 h (manifiesto de versión, models.dev) |
| `~/.local/share/opencode/auth.json`, `~/.config/opencode/opencode.json` | Solo durante el paso de importación del asistente o al pedirlo en `/providers`: se leen, se muestran enmascarados y se copian a los ficheros nativos de pi si el usuario acepta. Nunca se escriben ni se borran |
| `sonar.env` | `SONAR_URL` y `SONAR_TOKEN` escritos por `writeSonarEnv` con modo `0600`; nunca incluye `SONAR_PASS` ni vive en el repositorio |
| `migrated-from.json` | Recibo de la mudanza 0.2.x: `{ from, at }`. Solo aparece si `getDataDir` copió `pi-harness-moe/` a `alfred-pi/` |

El árbol `backups/` usa modo `0700` y todos sus archivos usan `0600`. Se
conservan diez copias no fijadas; las copias fijadas no caducan
automáticamente y deben eliminarse de forma expresa.

## Estado por proyecto (no vive bajo ~/.pi)

| Ruta | Contenido |
|---|---|
| `<repo>/.alfred-pi/memory-policy.json` | `{ "allow": true }` para encender memoria persistente en ese proyecto. Ausencia o JSON ilegible = desactivada. Opt-in expreso |
| `<repo>/.pi/skills`, `<repo>/.pi/prompts` | Symlinks de packs habilitados con alcance de proyecto. El harness solo retira los que él creó |

`PI_CODING_AGENT_DIR` desplaza el directorio de agente (tests y
instalaciones no estándar). `getBaseDir` lo respeta; `findRepoRoot`
sigue subiendo hasta encontrar `packs/`.

El generador `generateDocsSite({ docsDir, outDir })` escribe HTML a
`outDir` a partir de los markdown públicos. En este repo el destino es
`site/`, con `bun scripts/build-docs-site.ts`. No es estado del usuario
y `docs/auditoria/` no se copia.

## Sesiones de pi (solo lectura)

`~/.pi/agent/sessions/**/**.jsonl`: el harness lee los mensajes de
asistente con `usage` (`input`, `output`, `cacheRead`, `cacheWrite`,
`reasoning`), `provider` y `model` para uso, coste y presupuesto. Nunca
escribe ahí.

## Ciclo de una escritura

plan → diff unificado → confirmación → backup con marca temporal →
escritura atómica (tmp + rename, permisos conservados) → recarga del
registro de modelos. Si no hay cambios, no hay escritura.

## Nota de privacidad técnica

Descripción informativa del tratamiento de datos que hace el harness. No es
un dictamen jurídico: la valoración legal corresponde al operador.

| Aspecto | Detalle |
|---|---|
| Categorías de datos | Configuración de proveedores y modelos, credenciales (literales o referencias `$ENV`), estado propio (perfiles, autopilot, presupuesto, packs habilitados, persona, onboarding, recibos de auditoría), política de memoria por proyecto si el usuario la enciende, métricas de uso y coste, resultados de sondas de salud |
| Finalidad | Operar el centro de control: enrutado de modelos, relevo ante fallos, presupuesto diario, salud de proveedores y estadísticas de uso y coste |
| Base aplicable | Tratamiento íntegramente local, decidido por el usuario al instalar y usar el harness; el RGPD sirve de marco de referencia, sin valoración jurídica en este documento |
| Ubicación | `~/.pi/agent/` en la máquina del usuario: archivos nativos de pi (`models.json`, `auth.json`, `settings.json`), estado propio en `alfred-pi/` y sesiones de pi (solo lectura) |
| Destinatarios | El harness no envía sesiones ni claves a un backend del estudio. Hay salidas de red propias: catálogo models.dev (caché 24 h), búsqueda npm en `/packages`, y el canal de actualizaciones a `pi.686f6c61.dev` (fire-and-forget en `session_start`). El presupuesto y el uso se calculan solo con sesiones locales |
| Conservación | La fijada por cada archivo: diez backups no fijados y los fijados sin caducidad automática, cachés de 24 h, `health.jsonl` como historial acumulativo de sondas, `budget.json` con control por día |
| Borrado | Eliminar `~/.pi/agent/alfred-pi/` borra todo el estado propio; las sesiones las gestiona pi; las claves se retiran editando `models.json` o `auth.json` con las herramientas del harness |
