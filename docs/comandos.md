# Comandos, flag y TUI

Referencia de la superficie que el harness registra en pi. Cada comando
abre una pantalla de `lib/screens.ts` salvo `/persona`, que es un
`select` directo. El how-to de instalación está en
[instalacion.md](instalacion.md); el mapa de módulos, en
[modulos.md](modulos.md).

Los handlers reciben `(args: string, ctx)`, no `(ctx)`. Si un comando
se registra mal, el primer parámetro se come el contexto y la TUI no
arranca: hay un test de contrato precisamente por eso.

## Tabla de comandos

| Comando | Pantalla | Qué toca | Headless |
|---|---|---|---|
| `/providers` | `providersDashboard` | `models.json`, `auth.json`, `settings.json`: presets, alta a medida, claves, defaults, backups, intenciones de modelo | no |
| `/providers:doctor` | `doctorScreen` | Sondas de vida, reconciliación de config, historial `health.jsonl` | `--alfred-pi=doctor` |
| `/profile` | `profilesScreen` | `profiles.json`: pilas `{provider, model, thinkingLevel}` y perfil activo de relevo | no |
| `/domains` | `domainsScreen` | Habilita o retira packs (symlinks de skills y prompts, globales o de proyecto) | `--alfred-pi=domains` |
| `/essentials` | `essentialsScreen` | Catálogo curado de paridad. Auditoría previa. Nunca instala en silencio. Tramos `base` y `advanced` en orquestación | no |
| `/packages` | `packagesScreen` | Buscador npm (`keyword pi-package`) y fuentes git. La auditoría en el buscador se alinea; el corte firme es `/essentials` | no |
| `/usage` | `usageScreen` | Coste y tokens desde las sesiones JSONL locales; tope diario | `--alfred-pi=usage` |
| `/ollama` | `ollamaScreen` | `tags` / `ps` / `pull` / `rm` y alta en `models.json`. Modelos `:cloud` con `_launch` | no |
| `/autopilot` | `autopilotScreen` | Enciende el radar, elige `context` o `context+thinking`, reparte las cartas (`deal all`) | `--alfred-pi=autopilot` |
| `/stack` | `stackScreen` | Torre de control: modelo, radar, packs, salud, presupuesto | `--alfred-pi=stack` |
| `/persona` | `ui.select` | `persona.json`: Alfred o neutral. Surte efecto al turno siguiente | no |

`deal all` habilita las skills y prompts de todos los packs. El radar
sigue inyectando el contexto de **un** pack por turno. Tras repartir o
habilitar skills nuevas hace falta `/reload` para que pi redescubra el
menú.

## Flag `--harness-moe`

Registrado como string. En print (`pi -p --no-session`) escribe a
stdout y no abre TUI. Valores que el arranque reconoce:

| Valor | Salida |
|---|---|
| `doctor` | Informe de texto del doctor |
| `usage` | Informe de uso y coste |
| `stack` | Torre de control en texto |
| `stack:json` | La misma torre en JSON |
| `autopilot` y `autopilot:json` | `{enabled, routing, lastDomainId}` |
| `domains` y `domains:json` | Lista de packs con skills, prompts y si están habilitados |

Ejemplo:

```sh
pi --alfred-pi=doctor --no-session -p "ok"
pi --alfred-pi=stack:json --no-session -p "ok"
```

Un valor desconocido se ignora: la sesión sigue.

## Statusline

En TUI el harness escribe tres claves, nunca el resto del pie de pi:

| Clave | Contenido |
|---|---|
| `moe` | `provider/id` y, si falta credencial, `key` |
| `moe-domain` | `Sala activa: <id>` o `sin sala` (lengua de `house-copy.ts`) |
| `moe-budget` | `Presupuesto: N % de X USD` cuando hay tope |

El relevo avisa con `relevoAviso` («no responde: paso a tu reserva»).
Habilitar todos los packs usa la etiqueta `Habilitar todas las salas`.

## Intenciones de modelo

`/providers` puede filtrar candidatos con `classifyIntention` y
`pickModelsForIntention` (`lib/catalog.ts`). Las intenciones son
`local`, `vision`, `reasoner` y `fast`. Se leen de capacidades
estables (URL local, visión, razonamiento, o que haya tabla de
precio). No hay ruteo por coste: el presupuesto informa y el relevo
salta por fallo.

Si un modelo no tiene ficha en models.dev, el harness lo deja a la
vista y marca `missingMeta`. No lo esconde.

## Auditoría de paquetes

`/essentials` corre `auditNpmPackage` o `auditGitSource` antes de
proponer `pi install`. El informe es advisory: tú confirmas. El
recibo queda en `~/.pi/agent/alfred-pi/audit-receipts/` con
identidad `nombre@version`. El watchdog `assessCuration` (descargas y
fecha de publicación) etiqueta vivo, en decadencia o muerto; no
bloquea la instalación.

## Asistente de primer arranque

Si no hay proveedores ni entradas en `auth.json`, `session_start` en
TUI ofrece el asistente (`onboardingFlow`). Tres rutas: nube, máquina
local, pasarela. Cada escritura sigue plan → diff → backup → atómica.
Cerrar o diferir deja `onboarding.json` en `deferred` o `completed`;
el asistente no vuelve a insistir cuando ya hay casa.

Detalle de pantallas y viajes: [probar.md](probar.md).
