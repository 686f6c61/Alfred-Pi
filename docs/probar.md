# Cómo probar un cambio

How-to del arnés de pruebas. Los tests corren con bun, sin instalar pi
y sin red. Si un cambio de `lib/` no tiene test, no está listo.

## Arranque

```sh
bun test
bun test test/curate-turn.test.ts
bun test --coverage
```

`bunfig.toml` precarga `test/preload-pi-stubs.ts`, que sustituye
`@earendil-works/pi-tui` y `@earendil-works/pi-coding-agent`. Por eso
`index.ts` y `screens.ts` se importan en tests sin el runtime del
agente.

La cifra total de pruebas no se copia a la documentación: sale de
contar `test(` en `test/`. El README exige la cadena `bun test` y
prohíbe un entero «N tests».

## Mapa del árbol `test/`

| Zona | Qué cubre |
|---|---|
| `test/*.test.ts` junto a un módulo | Unidad de `lib/` (`config-io`, `prober`, `autopilot`, `curate-turn`, …) |
| `test/coverage-*.test.ts` | Ramas y errores que el archivo principal no pisaba |
| `test/siguiente-*.test.ts` | Cubo Siguiente: intenciones, watchdog, docs-site, memoria, local-first, house-copy, recibos de auditoría |
| `test/journeys/` | Viajes de TUI con UI falsa (`ScriptedUi`): alta de proveedor, doctor, packs, onboarding, flag headless |
| `test/helpers/scripted-ui.ts` | Doble de `ctx.ui` y de `ExtensionAPI` para esos viajes |
| `test/index-contract.test.ts` | Eventos `session_start`, `before_agent_start`, `after_provider_response` contra un pi falso |
| Guardianes | Fronteras y cifras que no pueden volver a romperse |

Cada test de integración apunta `PI_CODING_AGENT_DIR` a un directorio
temporal. `findRepoRoot` sigue resolviendo este repositorio (hace falta
para descubrir los 11 packs). `fetch` se sustituye para que el
update-check y models.dev no salgan a la red.

## Viajes (TUI)

Un journey no levanta `pi install` ni un PTY. Construye un `makeFakePi()`,
registra el plugin, dispara el handler y afirma notificaciones, diffs y
ficheros escritos.

Ejemplos:

- `journeys/headless-flags.test.ts`: `doctor`, `usage`, `stack`,
  `stack:json`, `autopilot`, `domains`.
- `journeys/onboarding-contract.test.ts`: el asistente no escribe sin
  confirmación.
- `journeys/essentials-install.test.ts`: hay auditoría y confirmación
  antes de cualquier `exec`.

Si cambias una pantalla, añade o extiende el viaje de esa pantalla.
Una captura mental de «se ve bien» no cuenta.

## Guardianes que no se negocian

| Test | Invariante |
|---|---|
| `public-docs-figures.test.ts` | README: 11 packs, skills y prompts del árbol, presets del array, `bun test` sin entero copiado. Glosario de arquitectura. Índice dice 11 packs |
| `pack-origin-license.test.ts` | Cada `SKILL.md` y prompt declara `origin` y `license`. Recuento actual 74 (48+26) |
| `pack-recommended-alive.test.ts` | Los `packages` de cada manifiesto no resucitan cadáveres vetados |
| `lib-import-guardians.test.ts` | Solo `screens.ts` y `onboarding-flow.ts` importan paquetes de pi. Autopilot y persona no importan `planWrites` |
| `exports.test.ts` | Imports usados |
| `skill-templates.test.ts` | Frontmatter cerrado y `description` no vacía |
| `dead-code.test.ts` | No dejar export huérfano a la ligera |

Si mueves el recuento de skills, actualizas el entero del test de
licencia **en el mismo cambio** que el árbol. No al revés.

## Contratos de `index.ts`

`test/index-contract.test.ts` comprueba, sin TUI real:

1. El flag `--alfred-pi=doctor` imprime el informe en modo print.
2. `before_agent_start` delega en `curateTurn` y puede devolver
   `systemPrompt` / `message`.
3. `after_provider_response` cuenta fallos y no llama a `setModel`
   (el relevo es del turno siguiente).

Un comando nuevo: registrar, viaje de pantalla, y si es headless, caso
en `headless-flags`.

## Cobertura

`bun test --coverage` cubre `lib/` e `index.ts`. Los ficheros
`coverage-*.test.ts` existen para ramas (JSON roto, permisos, timeouts)
que el camino feliz no pisa. No se persigue un porcentaje de vanidad:
cada rama que un usuario puede disparar debe tener aserción.

## Qué no se testea aquí

- Un Chrome real, un cluster Kubernetes o un SonarQube levantado en
  CI. Las skills describen el comando; el harness no lo ejecuta en el
  arnés.
- `pi install` contra npm. Los journeys fingen `exec` y afirman el
  argv.
- El sitio HTML (`generateDocsSite`) se testea con un `docsDir`
  de fixture, nunca escribiendo sobre `docs/` del repo. Para regenerar
  `site/` a partir de los markdown públicos:

```sh
bun scripts/build-docs-site.ts
```

No editar los HTML a mano. `docs/auditoria/` no entra.

## Humo manual (opcional)

Con el symlink de desarrollo (`CONTRIBUTING.md`):

```sh
pi --alfred-pi=doctor --no-session -p "ok"
```

No sustituye a `bun test`.
