/**
 * Credenciales que ya viven en el disco de otras herramientas: hoy OpenCode
 * (auth.json con las claves, opencode.json con las baseURL custom). Locate →
 * parse → map: devuelve un plan de importación que el asistente muestra
 * enmascarado y aplica solo con permiso. Copia, nunca muda. Node puro.
 */
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { PROVIDER_PRESETS } from "./presets.ts"

export interface OpencodeImportItem {
  /** Id del proveedor en OpenCode (zai-coding-plan, nan, ollama-cloud…). */
  sourceId: string
  /** "preset" si casa con un preset de la casa; "custom" si viaja con su baseURL. */
  kind: "preset" | "custom"
  /** Id del preset de Alfred cuando kind === "preset". */
  presetId?: string
  presetLabel?: string
  /** URL base efectiva: la del preset, o la de opencode.json para custom. */
  baseUrl?: string
  /** Sugerencia cuando no hay URL en opencode.json; el asistente la pide. */
  suggestedUrl?: string
  key: string
  keyMasked: string
}

/** Aliases verificados id de OpenCode → preset de Alfred. Gana el id exacto. */
const PRESET_ALIASES: Record<string, string> = {
  "zai": "zai-glm",
  "zai-coding-plan": "zai-coding",
  "zai-coding": "zai-coding",
  "kimi": "moonshot-kimi",
  "kimi-for-coding": "moonshot-kimi-anthropic",
  "kimi-coding": "moonshot-kimi-anthropic",
  "moonshot": "moonshot-kimi",
  "openai": "openai",
  "openai-codex": "openai-codex",
  "anthropic": "anthropic-claude",
  "claude": "anthropic-claude",
  "xai": "xai-grok",
  "grok": "xai-grok",
  "openrouter": "openrouter",
  "deepseek": "deepseek",
  "groq": "groq",
  "together": "together",
  "mistral": "mistral",
  "cerebras": "cerebras",
  "fireworks": "fireworks",
  "ollama-cloud": "ollama-cloud",
}

/** Sugerencia razonada cuando OpenCode no guarda baseURL para un servidor. */
export function guessSuggestedUrl(sourceId: string): string | undefined {
  if (sourceId.startsWith("opencode")) return "https://opencode.ai/zen/v1"
  return undefined
}

export function maskKey(key: string): string {
  if (!key) return "(vacía)"
  return `${key.slice(0, 7)}… (${key.length} chars)`
}

export interface OpencodeLocation {
  auth: string
  config: string
}

/**
 * Sitios canónicos de OpenCode por plataforma, todos bajo el home del
 * usuario: XDG (`~/.local/share`, `~/.config`) en Linux y macOS, y
 * `AppData/Roaming` en Windows. Se comprueban todos: cuesta nada y cubre
 * instalaciones mixtas (claves en un sitio, config en otro).
 */
export function opencodeLocations(home = homedir()): OpencodeLocation[] {
  return [
    {
      auth: join(home, ".local", "share", "opencode", "auth.json"),
      config: join(home, ".config", "opencode", "opencode.json"),
    },
    {
      auth: join(home, "AppData", "Roaming", "opencode", "auth.json"),
      config: join(home, "AppData", "Roaming", "opencode", "opencode.json"),
    },
  ]
}

/** Rutas canónicas XDG, las de Linux y macOS. */
export function locateOpencode(home = homedir()): OpencodeLocation {
  return opencodeLocations(home)[0]
}

function readTolerantJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"))
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

/** URL base utilizable: https, o http en loopback. Cualquier otra cosa, no. */
export function usableBaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol === "https:") return raw
    if (url.protocol === "http:" && isLoopback(url.hostname)) return raw
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Escanea OpenCode y devuelve los servidores importables: clave en auth.json
 * y, si hace falta, baseURL en opencode.json. Los sin clave o sin URL
 * utilizable no se ofrecen. Nunca lanza: un fuente roto no bloquea el arranque.
 */
export function scanOpencodeSources(home = homedir()): OpencodeImportItem[] {
  // Fusión de todas las ubicaciones candidatas: primera clave y primera
  // baseURL que aparezcan por id ganan.
  const keys = new Map<string, string>()
  const baseUrls = new Map<string, string>()
  for (const loc of opencodeLocations(home)) {
    const authRaw = readTolerantJson(loc.auth)
    if (authRaw) {
      for (const [id, value] of Object.entries(authRaw)) {
        const key = (value as { key?: unknown } | null)?.key
        if (typeof key === "string" && key && !keys.has(id)) keys.set(id, key)
      }
    }
    const configRaw = readTolerantJson(loc.config)
    if (configRaw) {
      const providers = (configRaw.provider ?? {}) as Record<string, { options?: { baseURL?: string } }>
      for (const [id, p] of Object.entries(providers)) {
        const b = p?.options?.baseURL
        if (typeof b === "string" && b && !baseUrls.has(id)) baseUrls.set(id, b)
      }
    }
  }

  const items: OpencodeImportItem[] = []
  for (const [sourceId, key] of keys) {
    const exact = PROVIDER_PRESETS.find((p) => p.id === sourceId)
    const aliasId = PRESET_ALIASES[sourceId]
    const preset = exact ?? (aliasId ? PROVIDER_PRESETS.find((p) => p.id === aliasId) : undefined)
    const customUrl = baseUrls.get(sourceId)

    if (preset) {
      items.push({
        sourceId,
        kind: "preset",
        presetId: preset.id,
        presetLabel: preset.label,
        baseUrl: preset.baseUrl,
        key,
        keyMasked: maskKey(key),
      })
    } else {
      const usable = usableBaseUrl(customUrl)
      items.push({
        sourceId,
        kind: "custom",
        ...(usable ? { baseUrl: usable } : {}),
        suggestedUrl: usable ?? guessSuggestedUrl(sourceId),
        key,
        keyMasked: maskKey(key),
      })
    }
  }
  return items
}
