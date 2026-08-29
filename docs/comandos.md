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

Los slash de pack (`/audit`, `/fanout`, `/implement`, `/flaky`, …) **no**
se registran en `index.ts`. pi los descubre al habilitar el pack. El
catálogo vive en [dominios.md](dominios.md). En 0.4.0: `/implement`
(grafo o spec) y la skill `bug-repro-loop` (mando rojo; no es un
comando slash).

## Flag `--alfred-pi`

Canónico. String. En print (`pi -p --no-session`) escribe a stdout y no
abre TUI. `--harness-moe` es alias deprecado: en 0.4.0 sigue
respondiendo y el doctor avisa. Valores que el arranque reconoce:

| Valor | Salida |
|---|---|
| `doctor` | Informe de texto del doctor |
| `usage` | Informe de uso y coste de todo el historial |
| `usage:N` | El mismo informe acotado a los últimos N días |
| `stack` | Torre de control en texto |
| `stack:json` | La misma torre en JSON |
| `autopilot` | Estado del radar en texto (`:json` lo da como objeto) |
| `domains` | Los 11 packs en texto, con skills, prompts y habilitación (`:json` como lista de objetos) |

Ejemplo:

```sh
pi --alfred-pi=doctor --no-session -p "ok"
pi --alfred-pi=stack:json --no-session -p "ok"
pi --alfred-pi=usage:7 --no-session -p "ok"
```

El sufijo con dos puntos cambia de oficio según el valor: en `stack`,
`autopilot` y `domains` elige formato (`:json`); en `usage` acota la
ventana temporal en días. Es la única asimetría del flag y conviene
recordarla al leer un script ajeno.

Un valor desconocido se ignora y la sesión sigue. Esa tolerancia es
deliberada: un flag mal escrito en un pipeline de CI no debe tumbar la
sesión del agente, solo dejar de imprimir el informe que se esperaba.

## Statusline

En TUI el harness escribe tres claves, nunca el resto del pie de pi:

| Clave | Contenido |
|---|---|
| `alfred` | `provider/id` y, si falta credencial, el sufijo de aviso más `key` |
| `alfred-sala` | `Sala activa: <id>` o `sin sala` (lengua de `house-copy.ts`) |
| `alfred-presupuesto` | `Presupuesto: N % de X USD` cuando hay tope |

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
