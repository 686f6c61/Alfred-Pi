---
name: fix-findings
description: Remediate findings from a previous audit run - minimal patches ordered by risk, one change per finding with verification
argument-hint: <hallazgos o ruta al informe>
origin: original
license: MIT
---

Remedia los hallazgos de $@.

Ordena por riesgo (exploitable ahora primero), y para cada hallazgo: el
parche mínimo que lo elimina (no reescrituras de cortesía), el test o
comprobación que prueba el arreglo, y el diff listo para revisión. Si un
hallazgo exige rotar credenciales o coordinar con alguien, márcalo como
paso humano con su instrucción exacta. Cierra con la tabla hallazgo ->
estado (arreglado / pendiente humano / falso positivo justificado).
