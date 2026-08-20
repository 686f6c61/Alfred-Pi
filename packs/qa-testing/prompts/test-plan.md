---
name: test-plan
description: Test plan for a feature or release - risk matrix, levels and what each asserts, exit criteria
argument-hint: <feature o release>
origin: original
license: MIT
---

Elabora el plan de pruebas de $@.

Aplica la skill test-strategy: matriz de riesgo (probabilidad x impacto)
de lo que puede romper, asignación de nivel por fila (unit/integración/
e2e/contrato) con lo que cada nivel afirma, casos límite y de fallo por
criterio de aceptación, datos deterministas (factories) y criterios de
salida. Entrega la matriz como tabla y la lista priorizada de tests a
escribir primero.
