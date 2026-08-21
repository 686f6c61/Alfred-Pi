# Arquitectura del harness

## Qué es un harness (y cuál es este)

Un **harness** es el armazón que rodea a un modelo de IA y lo convierte en
herramienta de trabajo: bucle de conversación, herramientas, contexto,
sesiones, modelos y credenciales. El modelo piensa; el harness ejecuta.

Este repositorio es un harness de **dos plantas**: pi aporta el harness
base (runtime) y Alfred-Pi aporta la capa de producto: gobierno de
proveedores, packs de trabajo con autopilot, seguridad de instalación,
coste y personalidad. Cuando la documentación dice «el harness», se refiere
a la capa de producto salvo que se indique lo contrario.

Documento técnico público; las notas internas de decisiones viven fuera del
repositorio.

## Glosario

Vocabulario canónico del producto. El código conserva nombres históricos
(`domains.ts`, `domain.json`, prefijo `dom:` en la TUI); este glosario manda
en la documentación y ninguno de esos identificadores se renombra.

- **pack**: ámbito de trabajo. Directorio de `packs/` con su manifiesto
  (`domain.json`), su `context.md`, skills y prompts. Es la unidad que el
  radar detecta, habilita e inyecta. En público se dice pack, no dominio.
- **paquete**: cosa que se instala (`pi install`, galería, esenciales).
  No es un pack.
- **contexto**: término reservado al DDD: la postura del pack que se
  inyecta en el system prompt envuelta en `<domain-packs>`. Nunca designa
  la ventana de tokens del modelo ni el historial de la sesión.
- **host**: endpoint de red que referencia un paquete auditado
  (networkHosts). En el tipo `PackageAudit` (lib/pkg-audit.ts) el campo
  `domains` conserva su nombre histórico: léase como networkHosts, la lista
  de hosts de red detectados en las fuentes escaneadas.
- **perfil**: pila `{provider, model, thinkingLevel}` con cadena de
  preferencia; el eslabón activo es el modelo en curso y los demás esperan
  como reserva.
- **relevo**: cambio al siguiente eslabón resoluble tras dos fallos
  consecutivos (HTTP o transporte), siempre entre turnos
  (`before_agent_start`), nunca en mitad de un stream.
- **clave**: credencial de API, literal o referencia `$ENV` / `${VAR}`,
  resuelta en tiempo de sonda. El prefijo `!` se rechaza (no se ejecuta).
  `auth.json` la guarda con permisos 0600.
- **turno**: ciclo completo prompt → respuesta del agente. El harness actúa
  en los bordes: reescribe el mundo antes del turno y contabiliza después.
- **sala**: cómo la TUI nombra al pack activo (`Sala activa: <id>`). No
  sustituye a pack en la documentación; es lengua de pie y avisos.
- **intención**: filtro de modelos por capacidad estable (`local`,
  `vision`, `reasoner`, `fast`). No es ruteo por precio.
- **presupuesto**: tope de gasto diario. Advisory en dos niveles: al 80 %
  avisa una vez al día y al 100 % añade la nota de frugalidad al system
  prompt. Modula, no bloquea.

## Principios del harness

1. **Cero dependencias en runtime.** Todo es `node:fs`,
   `node:child_process` y `fetch` nativo. La superficie de cadena de
   suministro es nula.
2. **Archivos nativos de pi como única verdad.** No existe configuración
   paralela: el harness lee y escribe `models.json`, `auth.json` y
   `settings.json`, y recarga el registro de modelos tras cada escritura.
3. **Advisory, nunca bloqueante.** La auditoría de paquetes informa; el
   presupuesto modula; nada detiene un turno en silencio.
4. **Curación entre turnos.** El relevo de modelos y los cambios de estado
   pesados ocurren en `before_agent_start`, nunca en mitad de un stream.
5. **Frontera lib/ pura.** Los módulos de `lib/` no importan nada de pi
   salvo `screens.ts` y `onboarding-flow.ts`. `index.ts` es el adaptador.
   Eso mantiene los tests autónomos (corren con bun, sin agente).

## Proceso y carga

pi carga el harness con jiti (TypeScript sin paso de build) desde el
paquete instalado. El alias interno de pi resuelve
`@earendil-works/pi-tui` y `@earendil-works/pi-coding-agent` dentro del
proceso del agente.

Secuencia de arranque del harness en cada sesión:

```
pi arranca
   │
   ├─ jiti carga index.ts del paquete instalado
   │     └─ registra 11 comandos + flag --alfred-pi
   │         (alias deprecado --harness-moe; doctor, usage, stack,
   │          autopilot, domains; variantes :json)
   │
   ▼
session_start
   ├─ flag --alfred-pi? ──print──▶ doctor/usage/stack/autopilot/domains
   │                              a stdout (la sesión no se cierra)
   ├─ TUI y sin casa? ──sí──▶ asistente de primer arranque
   ├─ TUI? ──sí──▶ cabecera de producto + statusline (alfred)
   ├─ reset del marcador de persona (una vez por sesión)
   └─ update-check (fire-and-forget a pi.686f6c61.dev, caché 24 h)
   │
   ▼
primer prompt ──▶ before_agent_start ──▶ bucle del agente
```

## Flujo de un turno, con fronteras exactas

```
 tú escribes
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ before_agent_start                                           │
│ index.ts llama a curateTurn (lib/curate-turn.ts)             │
│                                                              │
│  1. relevo: 2 fallos del modelo activo + perfil activo       │
│     ⇒ heal al siguiente eslabón resoluble (setModel aquí)    │
│  2. radar: prompt → hints de repo → sticky                   │
│     ⇒ contexto de UN pack envuelto en <domain-packs>         │
│     pie: Sala activa / sin sala                              │
│  3. presupuesto: gasto del día vs tope ⇒ nota si 100 %       │
│  4. persona: primer turno → mensaje oculto (display:false)   │
│  resultado: { systemPrompt, message?, heal? }                │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
   el modelo decide (con menú de skills de todos los packs)
      │
      ├──▶ respuesta directa
      ├──▶ tool call (bash/read/...) ──▶ resultados ──▶ (vuelve a decidir)
      ▼
┌──────────────────────────────────────────────────────────────┐
│ after_provider_response                                      │
│   estado HTTP → contador por provider/model (semáforo fb:)   │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
 model_select / fin de turno ──▶ statusline: alfred · alfred-sala · alfred-presupuesto
```

## Máquina de estados: failover

```
            respuesta HTTP ok
   ┌──────────────◀──────────────┐
   │                             │ contador = 0
   ▼                             │
 [SANO] ──fallo HTTP──▶ [fallo=1] ──fallo──▶ [fallo=2 = UMBRAL]
                                                │
                              before_agent_start del PRÓXIMO turno
                                                ▼
                        siguiente eslabón resoluble de la pila fb:
                        existe en registro + credencial configurada
                                   │ sí                    │ no
                                   ▼                        ▼
                            setModel + aviso          se queda y avisa
                            contador del caído = 0
```

Reglas dura: nunca en mitad de un stream; el contador del modelo retirado
se limpia para que recupere su turno más adelante.

## Máquina de estados: presupuesto

```
 gasto del día (sesiones locales × precios de models.json)
        │
        ▼
   [< 80%] ──ok──▶ statusline «Presupuesto: N % de X USD»
        │
   [≥ 80%] ──▶ aviso una sola vez al día (warnedOn)
        │
   [≥ 100%] ──▶ aviso crítico + nota <budget-exceeded> en el system
                 prompt (frugalidad: respuestas cortas, nada de fleets)
```

Observa y modula; no bloquea. Sin tope configurado no hay estados.

## Compositor del turno (`curateTurn`)

`index.ts` no ensambla el system prompt a mano. `curateTurn` lee el
estado en disco (`fallback.json`, `autopilot.json`, `domains.json`,
`budget.json`, `persona.json`, `models.json`) y devuelve un parche.
El adaptador aplica `setModel` si hay relevo, pinta el pie y devuelve
a pi el `systemPrompt` y el mensaje oculto de persona.

Orden fijo, de propósito: primero se sana el modelo, luego se elige
sala, luego se mira el gasto, luego viaja la persona. Mezclar ese
orden duplicaría efectos o inyectaría contexto con el modelo ya
caído.

La lengua de avisos y pie sale de `lib/house-copy.ts`: no se improvisan
cadenas en las pantallas.

## Autopilot: cascada de detección

```
        prompt del turno
              │
              ▼
   ┌──────────────────────┐   puntúa triggers de los 11 packs
   │ 1. disparadores      │   (ES/EN, límites de palabra,
   │    del prompt        │    peso = min(3, ceil(longitud/6)))
   └──────────┬───────────┘
        hay ganador ──sí──▶ pack ganador ──┐ (TUI: dom:)
              │ no                       │
              ▼                          │
   ┌──────────────────────┐              │
   │ 2. hints del repo    │  existeSync  │
   │    (Dockerfile,      │  por pack    │
   │    sonar-project…)   │              │
   └──────────┬───────────┘              │
        hay ganador ──sí─────────────────┤
              │ no                       │
              ▼                          │
   ┌──────────────────────┐              │
   │ 3. sticky: último    │──────────────┤
   │    pack detectado    │              │
   └──────────┬───────────┘              │
              │ no                       ▼
              ▼                 inyecta SOLO ese contexto
        sin inyección          (envuelto en <domain-packs>)
```

Solo el pack ganador paga coste de contexto. Los disparadores y hints
son datos del manifiesto de cada pack, no código. Con routing
`context+thinking` el harness aplica el `thinkingLevel` recomendado
del manifiesto, si el relevo no trajo ya uno.

A igualdad de puntos gana el pack cuyo `name` va antes en
`localeCompare`. Un trigger corto que empató con una palabra genérica
de otra sala (por ejemplo `producción` en DevOps) no se «arregla»
inventando locuciones: se documenta el empate.

## Intenciones, local-first, memoria y watchdog

Cuatro piezas posteriores que no cambian las máquinas de arriba y sí
cambian lo que el desarrollador ve:

- **Intenciones.** `classifyIntention` etiqueta un modelo como
  `local`, `vision`, `reasoner` o `fast` según URL local, visión,
  razonamiento o existencia de precio. `/providers` filtra con eso.
  No hay ruteo por coste: el presupuesto informa y el relevo salta por
  fallo.
- **Local-first.** `lib/local-first.ts` lista paquetes vivos para
  trabajo local, cada uno con aviso. No forman parte de esenciales.
- **Memoria por proyecto.** `.alfred-pi/memory-policy.json` en
  el repo del usuario, `{ "allow": true }` opt-in. Ausencia o JSON
  ilegible = desactivada. Nunca se enciende sola.
- **Watchdog de curación.** `assessCuration` (descargas y fecha de
  publicación, umbral 100 y 90 días) devuelve vivo, en decadencia o
  muerto. Es informativo; no bloquea `pi install`.

El generador `generateDocsSite` convierte los markdown públicos en
HTML bajo `site/` (canal de actualizaciones) y salta
`docs/auditoria/`. El sitio de producto es Astro en `www/` (rama
`landing`). No duplica contenido a mano.

## Persona: doble vehículo

```
 primer turno de la sesión
        │
        ├──▶ system prompt += <persona>…</persona>   (modelos fuertes)
        │
        └──▶ message oculta (display:false)           (modelos de
             "Norma de la casa, vigente toda la sesión"  adherencia débil)
                                                          │
 turnos siguientes: el historial ya la transporta ◀───────┘
```

La directiva viaja oculta en el transcript y persiste; por eso se envía
una única vez por sesión y `/persona` surte efecto al turno siguiente.

## Qué no merece bounded context (descarte D3-H09)

Tres frases fijan el mapa de contextos: Persona se entrega en la curación
de turno; Presentación es adaptador; Instalación es contexto supporting
con política advisory.

El hallazgo D3-H09 se cierra como descarte de diseño: Persona no tiene
invariante más allá de «id conocido o default», no colabora con otros
agregados y no merece bounded context propio. Por eso no existen carpetas
`persona/` ni `presentacion/`: Persona vive en la entrega de turno y
Presentación sigue siendo la capa adaptadora de la TUI, sin modelo propio.

## Escritura segura de configuración

```
 cambio solicitado (TUI)
        ▼
   planWrites()          resultado final + diff unificado
        ▼                (sin cambios ⇒ fin, no se escribe nada)
   diff en pantalla ──▶ confirmación del usuario
        ▼
   backupFiles()         copia con marca temporal a
        ▼                backups/ (retención 10, pin a salvo)
   atomicWriteText()     tmp + rename, permisos conservados
        ▼                (auth.json sigue 0600)
   modelRegistry.refresh()   el cambio aplica EN VIVO
```

## Eventos de pi que el harness consume

| Evento | Fases | Uso en el harness |
|---|---|---|
| `session_start` | arranque, reload, nueva, resume | flag headless, asistente si no hay casa, cabecera, statusline, update-check, reset de persona |
| `before_agent_start` | pre-bucle | `curateTurn`: relevo, radar, presupuesto, persona |
| `after_provider_response` | tras cada HTTP o error de transporte | conteo de fallos por `provider/model`; nunca `setModel` aquí |
| `model_select` | cambio de modelo | refresco del statusline |

Eventos de pi que este harness **no** engancha: `tool_call`,
`tool_result`, `before_provider_request`, `agent_settled`. El núcleo
del agente sigue su ciclo; la capa de producto actúa en los bordes
del turno.

## Presupuesto y uso: de dónde salen los números

`spendToday` agrega el coste del día leyendo los JSONL de sesión de pi
(mensajes de asistente con `usage`) y multiplicando por la tabla de
precios de `models.json` (la misma que autofilla models.dev). Modelos sin
precio: tokens visibles y `n/a`; el informe dice cuántos turnos tenían
precio. Tarifación honesta: mejor hueco visible que número inventado.

## Paralelismo y serie

En paralelo: sondas de vida del doctor, auditorías de paquetes, catálogo
models.dev y canal de actualizaciones (fire-and-forget, nunca bloquean tu
sesión). En serie, por diseño: escrituras de configuración (plan → diff →
backup → atómica) y failover (solo entre turnos; reintentar en mitad de un
stream duplica efectos).

## Frontera de pruebas

El gate es `bun test` del harness, sin agente: la frontera lib/ pura lo
permite. CI añade dos regresiones nacidas de bugs reales: despacho de
comandos (los handlers toman `(args, ctx)`) y el guardián de imports
sin exportar. El check de Astro (`www/`) no sustituye a esa batería.
Mapa y how-to: [probar.md](probar.md).
