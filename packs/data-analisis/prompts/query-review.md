---
name: query-review
description: Review a slow or suspicious SQL query - plan analysis, index proposal, rewrite with before/after evidence
argument-hint: <consulta o ruta>
origin: original
license: MIT
---

Optimiza la consulta $@.

Aplica la skill sql-optimization: EXPLAIN (ANALYZE, BUFFERS) si hay base
accesible; si no, análisis estático del plan esperado. Entrega: los olores
del plan con su evidencia, la reescritura propuesta, los índices con su
justificación de selectividad y coste de escritura, y el antes/después
medido (o cómo medirlo). Nada de afirmaciones sin plan.
