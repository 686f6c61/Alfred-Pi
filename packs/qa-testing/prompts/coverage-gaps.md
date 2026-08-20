---
name: coverage-gaps
description: Find what the suite does not protect - map critical paths vs existing tests, list the gaps that matter
argument-hint: <ruta o suite>
origin: original
license: MIT
---

Busca los huecos de cobertura de $@.

Primero la lista de caminos críticos (reglas de negocio, fronteras de
integración, los 3-7 journeys del producto, contratos entre servicios);
luego el inventario de lo que la suite afirma hoy, por nivel; crúzalos y
entrega los huecos que importan (tabla: camino, riesgo si rompe, nivel
recomendado, test concreto a escribir), no el porcentaje de líneas. Cierra
con los tres tests de mayor valor por escribir primero.
