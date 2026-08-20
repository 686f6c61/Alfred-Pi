---
name: revision-es
description: Revisa un texto (o archivo) en español aplicando normas RAE y estilo claro - tildes, signos, concordancia, extranjerismos y cero emojis
argument-hint: <texto o ruta>
origin: original
license: MIT
---

Revisa en español: $@

Aplica la skill rae-normas al completo: tildes y diacríticos, signos de
puntuación, mayúsculas, concordancia, régimen preposicional, extranjerismos
(cursiva o adaptación), pleonasmos y tics de escritura artificial. Elimina
todos los emojis salvo que el usuario los haya pedido. Entrega:

1. El texto corregido (si es un archivo, edítalo en sitio y muestra solo el diff).
2. Una lista breve de los cambios con la norma aplicada cuando no sea evidente.
3. Si hay decisiones de estilo discutibles (p. ej. «» vs ""), márcalas como
   opcionales en vez de imponerlas.
