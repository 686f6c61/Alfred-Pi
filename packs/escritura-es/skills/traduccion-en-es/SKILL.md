---
description: Traducción editorial entre inglés y español con glosario, localización de formatos y control de significado. Use al traducir o localizar documentación, interfaces o textos técnicos entre EN y ES.
origin: original
license: MIT
---

# Traducción EN ↔ ES

Produce la traducción terminada, un miniglosario de decisiones y una lista
breve de cambios, dudas y elementos que deben permanecer sin traducir.

## Procedimiento

1. **Fija el encargo.** Declara idioma de origen y destino, variante regional,
   audiencia, registro, canal y formato. Distingue traducción fiel, localización
   y transcreación; si no se autoriza adaptar el mensaje, conserva su alcance.
2. **Lee la pieza completa.** Identifica título, navegación, variables, bloques
   de código, enlaces, texto alternativo y límites de longitud. En un repositorio,
   busca precedentes con `rg -n "<término>|<traducción>" docs src locales` y
   reutiliza el glosario o la guía de estilo existentes.
3. **Cierra un miniglosario.** Elige una traducción por concepto, registra los
   términos que se conservan en inglés y anota cualquier decisión regional.
   Mantén identificadores, rutas, claves de API y marcadores como `{name}` sin
   cambios, salvo que el contrato del formato ordene otra cosa.
4. **Traduce por unidades de sentido.** Conserva hechos, modalidad, negaciones,
   condiciones y jerarquía. Ajusta sintaxis y ritmo al idioma de destino sin
   añadir beneficios, obligaciones, tecnicismos ni tono que el original no tenga.
5. **Localiza formatos.** Comprueba números, decimales, miles, moneda, fecha,
   hora, zona horaria, unidades, comillas y pluralización. No conviertas unidades
   ni importes sin una fuente y una instrucción expresa.
6. **Haz dos pasadas de control.** Lee primero solo el texto de destino para
   detectar calcos; después compáralo con el origen para comprobar omisiones,
   cifras, enlaces, marcadores y términos del glosario.
7. **Entrega y deriva dudas.** Conserva la estructura y el formato de origen,
   muestra el diff si se editan archivos y separa la traducción de las consultas
   que debe resolver el autor o un especialista.

## Criterios entre inglés y español

- Prefiere términos asentados, como «desplegar», «prueba» o «biblioteca», cuando
  encajen; conserva `commit`, `bug` o nombres de producto si son el uso real.
- Evita falsos amigos: `actual` suele ser «real», `eventually` suele ser
  «finalmente» y `assist` suele ser «ayudar».
- En español, usa 1.234,56, «3 de marzo» y «10 h» si la variante y el canal lo
  admiten. En inglés, aplica el formato regional indicado, no uno supuesto.
- En español técnico, prefiere construcciones naturales y divide las oraciones
  largas cuando mejore la comprensión sin alterar relaciones lógicas.
- Aplica las reglas de la casa: español conforme a la RAE, cero emojis y sin
  raya dentro de las frases.

## Formato de salida

```text
Traducción: <texto final o archivos editados>
Glosario: <origen> | <destino> | <decisión>
Cambios de localización: <números, fechas, unidades, tono o ninguno>
Elementos preservados: <código, variables, nombres propios, enlaces>
Dudas para el autor: <pregunta con ubicación o ninguna>
```

## Qué no hacer

- No traduzcas palabra por palabra si se pierde el significado o el registro.
- No inventes equivalentes para marcas, comandos, identificadores o claves.
- No neutralices una ambigüedad material sin devolverla al autor.
- No corrijas hechos, requisitos o promesas como si fueran errores de lengua.
- No expongas secretos presentes en el archivo al copiarlos al informe.

## Límites y derivación

Esta skill traduce y localiza; `rae-normas` resuelve dudas normativas y la skill
`i18n-l10n` del pack web implementa catálogos, ICU y negociación de idioma.
Detente y consulta al autor ante terminología sin fuente o una ambigüedad que
cambie obligaciones. Deriva textos jurídicos, médicos o certificados a un
traductor profesional del ámbito y no presentes esta revisión como traducción
jurada. No cambies archivos fuera del encargo ni publiques la traducción sin
aprobación.
