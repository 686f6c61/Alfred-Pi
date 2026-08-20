# Documentación técnica de Alfred-Pi

Documentación pública del sistema, mantenida junto al código. El código
es la verdad final: si algo difiere, gana el código y se corrige este
árbol en el mismo cambio.

Hay dos lectores. Las páginas de producto explican la casa a quien la
opera. Las de desarrollador explican cómo extenderla y cómo verificar
un cambio. `docs/auditoria/` es taller interno: no se publica y el
generador de sitio lo excluye.

## Producto y operación

| Documento | Pregunta |
|---|---|
| [pi.md](pi.md) | ¿Qué es un harness y cómo funciona el anfitrión pi? |
| [arquitectura.md](arquitectura.md) | ¿Qué principios, máquinas de estado y flujo de turno tiene esta capa? |
| [instalacion.md](instalacion.md) | ¿Cómo se instala, verifica, actualiza y desinstala? |
| [comandos.md](comandos.md) | ¿Qué comando, flag y pantalla hay, y qué toca? |
| [dominios.md](dominios.md) | ¿Cuáles son los 11 packs, sus skills, prompts y casos de uso? |
| [datos-y-config.md](datos-y-config.md) | ¿Qué archivos nativos y qué estado propio existen, campo a campo? |

## Desarrollador

| Documento | Pregunta |
|---|---|
| [modulos.md](modulos.md) | ¿Qué módulo de `lib/` hace qué, y cuál es la frontera con pi? |
| [extender.md](extender.md) | ¿Cómo añado un pack, una skill, un preset o un esencial? |
| [probar.md](probar.md) | ¿Cómo verifico un cambio con bun, sin pi instalado? |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Normas cortas de contribución y release |
| [SECURITY.md](../SECURITY.md) | Cómo reportar una vulnerabilidad |

Cifras (11 packs, skills, prompts, presets) salen del árbol, no de un
entero copiado. El test `public-docs-figures` vigila README e índice.

HTML estático: `bun scripts/build-docs-site.ts` escribe `site/`. La
auditoría interna no se publica.
