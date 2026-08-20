---
name: flaky
description: Hunt a flaky test - quantify failure rate, classify cause, reproduce on demand, fix the cause
argument-hint: <test o suite>
origin: original
license: MIT
---

Caza el flaky en $@.

Sigue la skill flaky-hunting: tasa de fallo si hay historial, clasificación
del olor (tiempo, orden, async, entorno, concurrencia, residuos), receta
de reproducción determinista (semillas, reloj controlado, orden
barajado), arreglo de la causa (nunca reintentos) y prevención (cuarentena
con dueño y caducidad, tasa de flake visible). Entrega el informe de una
línea por flaky: test, tasa, causa, reproducción, fix, PR.
