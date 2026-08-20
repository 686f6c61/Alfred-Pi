# Normas de este repositorio

Extensión Alfred-Pi - control center para el agente pi. Lee
los [docs técnicos](docs/) antes de cambiar decisiones de arquitectura y
[CONTRIBUTING.md](CONTRIBUTING.md) para las reglas del proyecto.

## Escritura

- Español conforme a la RAE en todo texto que produzcas (respuesta,
  documentación, changelog, comentarios). Ante la duda, consúltalo.
- **Cero emojis en cualquier salida**: código, consola, TUI, documentación,
  commits - salvo petición expresa del usuario. Sí se admiten signos
  tipográficos (✓ ✗ ★ ● ▸ → « » - …) en la interfaz de terminal.
- Comentarios: en inglés si el archivo ya está en inglés, en español si es
  nuevo; siempre explicando el porqué.

## Código

- Cero dependencias runtime; `lib/` puro Node sin imports de pi.
- Todo cambio de `lib/` con tests (`bun test` en verde antes de commitear).
- Escrituras de config solo vía plan → diff → backup → write atómico.

## Signos

- La raya (—) no se usa dentro de las frases: incisos con comas o paréntesis,
  aclaraciones con dos puntos. Sí se permite como viñeta o separador
  estructural (títulos, tablas).
