# Cómo extender el harness

How-to para quien añade un pack, una skill, un prompt, un preset o un
esencial. Las reglas cortas viven también en
[CONTRIBUTING.md](../CONTRIBUTING.md). El catálogo de packs está en
[dominios.md](dominios.md).

## Frontera que no se cruza

- `lib/` es Node puro (`node:fs`, `node:child_process`, `fetch`).
  Excepción vigilada: `screens.ts` y `onboarding-flow.ts` pueden
  importar `@earendil-works/pi-tui` y `@earendil-works/pi-coding-agent`.
  El resto, no. El test `lib-import-guardians` lo exige.
- `index.ts` es el adaptador: registra comandos, flag y eventos, y
  aplica el parche de `curateTurn`.
- Cero dependencias runtime. Nada de `pi install` en silencio.
- Escrituras de `models.json`, `auth.json` y `settings.json` solo por
  plan → diff → backup → atómica.
- Cifras públicas (packs, skills, prompts, presets) salen del árbol.
  `test/public-docs-figures.test.ts` las contrasta con README.

## Añadir un pack

Un pack es un directorio `packs/<id>/` con este contrato:

```
packs/<id>/
  domain.json      manifiesto (id, name, description, triggers, repoHints?, packages?)
  context.md       postura inyectada; techo ~15 líneas; test del borrado
  skills/<nombre>/SKILL.md
  prompts/<nombre>.md
```

`id` del manifiesto coincide con el nombre del directorio.
`discoverDomains` ignora carpetas que empiezan por punto y omite el
pack si falta `domain.json` o `SKILL.md` ilegible.

### `domain.json`

| Campo | Rol |
|---|---|
| `id`, `name`, `description` | Identidad. `name` ordena el empate alfabético del radar |
| `triggers` | Palabras o locuciones ES/EN. Coincidencia de palabra completa, insensible a mayúsculas. Peso `min(3, ceil(longitud / 6))` |
| `repoHints` | Ficheros o globs con un solo `*` en el último segmento. Solo se miran si ningún trigger casa, y solo en la raíz del cwd |
| `packages` | Recomendados vivos. Si el cuerpo de una skill cita un paquete que aquí no está, es un error de higiene |
| `recommended.thinkingLevel` | Se aplica solo con routing `context+thinking` |

Los triggers se curan como código. Una palabra genérica (`server`,
`captura`, `documentar`) choca con otra sala. El empate a puntos lo
gana el pack cuyo `name` va antes en localeCompare: «DevOps / Infra»
gana a «Web / Fullstack» a igualdad.

No se crea un duodécimo pack sin oficio que las once salas no cubran.

### `context.md`

Cada línea es una restricción de este turno: hacer, no hacer, orden o
formato. Si al borrarla el modelo no cambia de conducta, era lema y
sale. Prohibidos los racimos de virtudes. El pack no resume sus
skills: postura aquí, procedimiento en `SKILL.md`.

### Skill (`SKILL.md`)

Frontmatter obligatorio:

```yaml
---
description: Oficio en una cláusula. Use when the user asks to…
origin: original
license: MIT
---
```

En `escritura-es` el disparador es «Use al …». `origin` es `original`
o `adapted`. `license` es SPDX (MIT salvo declaración expresa). El
test `pack-origin-license` recorre las skills y prompts del árbol.

Barra de diez puntos (comprobable en frío; detalle de producto en
`docs/auditoria/` interno, no se publica):

1. Frontmatter disparador con intenciones del usuario, no con la etiqueta del pack.
2. Oficio y entregable en el primer párrafo tras el H1.
3. Procedimiento numerado con ancla (fichero, comando, API o plantilla).
4. Formato de salida literal (tabla o plantilla de hallazgo).
5. Qué no hacer: tres a cinco anti-patrones de este oficio.
6. Límites y derivación a la skill o pack hermano.
7. Higiene de efectos: secretos fuera, destructivo con confirmación, cero paquetes muertos.
8. Idioma del pack (inglés salvo `escritura-es`), cero emojis, cero relleno.
9. Una idea, una skill. Si solapa, se fusiona o se declara el delta.
10. Un revisor marca los nueve puntos anteriores sin discutir de gusto.

Horquilla orientativa: 45 a 90 líneas en skills de procedimiento.
Por encima de 100 empieza el tratado. Una skill de 40 líneas
ejecutable gana a un ensayo de 90.

Tras añadir o fusionar skills: actualizar la tabla de
[dominios.md](dominios.md), el README y el CHANGELOG. El recuento del
guardián de origin/license se mueve con el árbol.

### Prompt (`prompts/<nombre>.md`)

Frontmatter con `origin` y `license`. El nombre del fichero, sin
extensión, es el slash-command que pi descubre cuando el pack está
habilitado (`/audit`, `/guide`, …). No se duplica una skill con un
prompt que cuenta lo mismo.

## Añadir un preset

`lib/presets.ts`. La clave es una referencia `$ENV`, nunca un literal.
Antes de commitear se verifica el endpoint en vivo (curl de estado).
`compat.supportsDeveloperRole: false` cuando el backend descarta el
rol `developer`. El doctor sondea eso.

## Añadir un esencial

`lib/essentials.ts`. Describe lo que el usuario gana (comandos que
aparecen). `category` coherente. Orquestación usa `tier: "base"` o
`"advanced"`; son mutuamente excluyentes en la UI. Nunca se instala
solo: la pantalla corre la auditoría y pide confirmación.

Paquetes de trabajo **local** que no son esenciales viven en
`lib/local-first.ts` (`LOCAL_FIRST`), cada uno con aviso de qué
revisar. No se mezclan con el catálogo de paridad.

## Lengua pública

Pack, paquete, turno, presupuesto, relevo, clave, perfil. En la TUI
se dice sala, no dominio. `domain.json`, `domains.ts` y el prefijo
histórico `dom:` no se renombran en código.

Español conforme a la RAE en documentación, changelog y TUI. Cero
emojis. La raya no se usa dentro de las frases.

## Qué no se hace

- Pack por lenguaje o por runtime.
- Skill gemela que compite por el mismo disparador.
- Recomendar un paquete muerto (menos de 100 descargas/mes y meses
  sin publicar). El test `pack-recommended-alive` y el watchdog
  `assessCuration` vigilan señales; el criterio editorial manda.
- Tocar `docs/auditoria/`: es taller interno, el generador de sitio
  lo excluye.
