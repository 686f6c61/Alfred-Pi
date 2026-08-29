# Instalación desde cero, operación y desinstalación

Guía exhaustiva: requisitos, vías de instalación y qué toca cada una,
configuración inicial, verificación, actualización y desinstalación
completa.

## Requisitos

- [pi](https://pi.dev) 0.84 o superior (`curl -fsSL https://pi.dev/install.sh | sh`).
- Opcional: servidor Ollama local o de nube, claves de cualquier proveedor,
  bun (solo para desarrollo y tests).

## Instalación

### Vía 1: paquete desde GitHub (recomendada)

```sh
pi install git:github.com/686f6c61/Alfred-Pi
```

Qué toca: descarga el árbol al almacén de paquetes de pi y añade la
fuente a `packages` en `~/.pi/agent/settings.json`. No modifica
`models.json`, `auth.json` ni crea estado propio hasta que tú lo hagas.
npm aún no se publica; la vía git es la canónica. Versión vigente:
0.4.0.

### Vía 2: probar sin instalar

```sh
pi -e git:github.com/686f6c61/Alfred-Pi
```

Carga la extensión solo para esa sesión. Ideal para evaluar.

### Vía de desarrollo

```sh
git clone https://github.com/686f6c61/Alfred-Pi && cd Alfred-Pi
ln -sfn "$PWD" ~/.pi/agent/extensions/alfred-pi
```

El symlink sirve el código local en cada arranque; `/reload` recarga tras
editar.

## Si vienes de OpenCode

Si ya configuraste claves en OpenCode, el asistente de primer arranque las
encuentra antes de preguntarte nada: lee `~/.local/share/opencode/auth.json`
y `~/.config/opencode/opencode.json`, te muestra los servidores con clave
(enmascarados) y los importa con una confirmación. Los que casan con un
preset de la casa (z.ai GLM y Coding Plan, Kimi, Ollama Cloud, OpenRouter,
DeepSeek…) se montan solos; los demás entran como proveedor custom con su
baseURL. Copia, no muda: OpenCode sigue funcionando igual y nada viaja a la
red durante la importación; la sonda corre después, con cada servidor, y el
estado queda a la vista. En agent dirs aislados (`PI_CODING_AGENT_DIR`), la
importación no se ofrece: las claves no se filtran a entornos desechables.

## Primer arranque

Si no hay proveedores ni entradas en `auth.json`, la TUI ofrece el
asistente. Tres rutas:

1. **Nube**: suscripción nativa de pi (`/login`) o un preset con clave.
2. **Máquina local**: Ollama con modelos ya instalados, llama.cpp nativo,
   LM Studio, vLLM o SGLang ya encendidos. No se descarga un modelo en
   silencio.
3. **Pasarela**: LiteLLM u otro compatible OpenAI de los presets.

Cada escritura enseña el diff y pide confirmación. Cerrar el asistente
lo deja en `deferred`; cuando ya hay casa, no vuelve. Si ya tienes
proveedores, ves la cabecera y los comandos (`/providers`, `/stack`,
etc.).

Si vienes de 0.2.x, el primer arranque copia
`~/.pi/agent/pi-harness-moe/` a `~/.pi/agent/alfred-pi/` cuando el
directorio nuevo no existe, deja `migrated-from.json` y no borra el
origen. Los archivos nativos de pi no se tocan.

Referencia de cada comando y del flag headless:
[comandos.md](comandos.md). El canónico es `--alfred-pi`.
`--harness-moe` sigue respondiendo en 0.4.0 y el doctor avisa.

## Configuración inicial

1. **Primer proveedor**: `/providers` → *+ Add provider…* → elige preset
   (22 disponibles) o *Custom OpenAI-compatible server* para tu propio
   servidor (vLLM, SGLang, LiteLLM...). El asistente descubre modelos con
   `GET /models`, rellena metadatos desde models.dev (solo campos vacíos) y
   muestra el diff antes de escribir.
2. **Clave**: literal o `$ENV_VAR` (recomendado). El prefijo `!` se
   rechaza al resolver (`resolveKeyRef`): el harness no ejecuta un
   comando para obtener secretos. El diálogo de alta aún menciona
   `!command` en el texto de ayuda; si lo escribes, falla.
   Siempre enmascarada en pantalla. `/providers` → provider → *API key*
   o *Keys & auth*.
3. **Defaults**: provider, modelo y nivel de pensamiento; se aplican en vivo
   a la sesión.
4. **Packs**: `/autopilot` enciende el radar (un pack por turno) y puede
   poner a punto las skills. Alternativa manual: `/domains` y habilita
   global o por proyecto. Las skills nuevas piden `/reload`.
5. **Opcional**: `/essentials` (paridad con los agentes grandes, con
   auditoría previa), `/usage` → *Daily budget*, `/profile` → pila con
   relevo, `/ollama` para registrar tus modelos.

## Verificación

```sh
pi --alfred-pi=doctor --no-session -p "ok"
```

Debe imprimir el informe del doctor (configuración y proveedores). Otros
valores del flag: `usage`, `stack`, `stack:json`, `autopilot`, `domains`.
Dentro de pi: `/stack` muestra el estado completo y `/providers:doctor` el
informe interactivo.

Quien desarrolla el harness verifica con `bun test`, sin pi:
[probar.md](probar.md).

## Operación diaria

- Abre pi en cualquier carpeta: proveedores, persona, presupuesto y packs
  globales aplican solos.
- Por proyecto cambian solo los hints del autopilot (Dockerfile,
  sonar-project.properties, astro.config...) y los packs habilitados con
  alcance de proyecto (`.pi/skills`, `.pi/prompts`).
- Cambios de proveedores aplican en vivo (recarga del registro); skills y
  prompts nuevos necesitan `/reload`.

## Actualización

```sh
pi update --all
```

El estado (`~/.pi/agent/alfred-pi/`) y tus archivos nativos no se
tocan. Cada escritura de configuración deja backup restaurable
(`/providers` → *Backups*).

## Desinstalación completa

1. **Retirar packs habilitados** (deja los enlaces limpios):
   `/domains` → deshabilita cada pack. Si ya no tienes la extensión
   cargada, borra a mano los symlinks que apunten al paquete:
   `~/.pi/agent/skills/`, `~/.pi/agent/prompts/` y los `.pi/skills`,
   `.pi/prompts` de los proyectos donde habilitaste packs. Comprueba con
   `ls -l` que el enlace apunta al paquete antes de borrarlo.
2. **Desinstalar el paquete**:
   ```sh
   pi remove git:github.com/686f6c61/Alfred-Pi
   ```
   Retira el paquete del almacén y la entrada de `packages` en settings.
3. **Borrar estado propio** (opcional, si no vas a volver):
   ```sh
   rm -rf ~/.pi/agent/alfred-pi
   ```
   Contiene perfiles, autopilot, presupuesto, packs, salud, cachés y
   backups.
4. **Tus archivos nativos** (`models.json`, `auth.json`, `settings.json`)
   son tuyos: conserva los proveedores que hayas configurado o edítalos a
   mano; la desinstalación no los modifica.

## Reinstalación

Repite la vía 1. El estado propio se relee tal cual: perfiles, presupuesto
y ajustes vuelven como estaban.
