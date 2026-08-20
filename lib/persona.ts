/**
 * Response personas for pi-harness-moe. The selected persona's voice rules
 * are appended to the system prompt on every turn (before_agent_start).
 * Zero emojis, no em dash inside sentences: the personas obey the house
 * style they teach.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"

export interface Persona {
  id: string
  name: string
  description: string
  prompt: string
}

export const PERSONAS: Persona[] = [
  {
    id: "alfred",
    name: "Alfred",
    description: "Educado, sarcástico e irónico; técnica impecable. El mayordomo del harness.",
    prompt: [
      "<persona>",
      "VAS A RESPONDER CON ESTA VOZ EN TODOS LOS MENSAJES, incluidas las",
      "presentaciones: eres Alfred, mayordomo digital de harness.moe. Nunca te",
      "presentes como asistente o modelo de IA genérico; si preguntan quién eres,",
      "eres Alfred y te presentas como tal con una pizca de humor de mayordomo.",
      "",
      "Registro: impecablemente educado, humor fino de mayordomo británico,",
      "sarcasmo seco e ironía elegante, siempre al servicio de la claridad y jamás",
      "del desprecio. La ironía jamás toca lo crítico: datos técnicos, seguridad,",
      "precios y pasos de producción se entregan con precisión absoluta.",
      "",
      "Muy técnico: citar versión, archivo y línea cuando existan; cero relleno;",
      "si algo es una chapuza, puedes llamarla una peculiaridad de diseño",
      "exactamente una vez y después dilo claro. Frases cortas, voz activa.",
      "Puedes dirigirte al usuario como señor cuando la formalidad sume.",
      "",
      "Respondes en el idioma del usuario. Sin emojis y sin raya (—) dentro de",
      "las frases: las normas de la casa se aplican también a ti.",
      "</persona>",
    ].join("\n"),
  },
  {
    id: "none",
    name: "Neutral",
    description: "Sin personalidad añadida; el estilo viene de AGENTS.md y los dominios activos.",
    prompt: "",
  },
]

export const DEFAULT_PERSONA = "alfred"

export interface PersonaState {
  persona: string
}

function statePath(dataDir: string): string {
  return join(dataDir, "persona.json")
}

export function loadPersonaState(dataDir: string): PersonaState {
  const file = statePath(dataDir)
  if (!existsSync(file)) return { persona: DEFAULT_PERSONA }
  try {
    const s = JSON.parse(readFileSync(file, "utf-8")) as PersonaState
    return { persona: PERSONAS.some((p) => p.id === s.persona) ? s.persona : DEFAULT_PERSONA }
  } catch {
    return { persona: DEFAULT_PERSONA }
  }
}

export function savePersonaState(state: PersonaState, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  atomicWriteJson(statePath(dataDir), state)
}

export function personaPrompt(id: string): string {
  return PERSONAS.find((p) => p.id === id)?.prompt ?? ""
}

/**
 * Conversation-message form of the persona. Weak-adherence models ignore
 * late system-prompt additions but follow in-conversation directives, so the
 * persona rides both vehicles: system prompt (strong models) and a hidden
 * first-turn message (the rest).
 */
export function personaDirective(id: string): string {
  const prompt = personaPrompt(id)
  if (!prompt) return ""
  return "Norma de la casa, vigente para toda la sesión:\n" + prompt.replace(/^<persona>\n?/, "").replace(/\n<\/persona>$/, "")
}

/** Startup header lines: branding + two-line explanation of the product. */
export function buildHeaderLines(version: string): string[] {
  return [
    "Alfred-Pi · un producto de harness.moe · desarrollado por @686f6c61",
    "Centro de control para pi: proveedores, modelos y claves con doctor y presupuestos;",
    `dominios de trabajo con autopilot, auditoría de paquetes y uso/coste local. v${version}`,
  ]
}
