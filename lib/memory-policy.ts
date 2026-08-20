import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"

export interface MemoryPolicy {
  allow: boolean
}

export interface SaveMemoryPolicyOptions extends MemoryPolicy {
  projectRoot: string
}

const POLICY_DIR = ".alfred-pi"
const LEGACY_POLICY_DIR = ".pi-harness-moe"
const POLICY_FILE = "memory-policy.json"

function policyPath(projectRoot: string, dir = POLICY_DIR): string {
  return join(projectRoot, dir, POLICY_FILE)
}

function readAllow(path: string): MemoryPolicy | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as { allow?: unknown }
    return { allow: parsed.allow === true }
  } catch {
    return { allow: false }
  }
}

/** La ausencia o un archivo ilegible mantienen la memoria desactivada. */
export function loadMemoryPolicy(projectRoot: string): MemoryPolicy {
  return readAllow(policyPath(projectRoot)) ?? readAllow(policyPath(projectRoot, LEGACY_POLICY_DIR)) ?? { allow: false }
}

/** Persiste únicamente una decisión expresa dentro del proyecto. */
export function saveMemoryPolicy(options: SaveMemoryPolicyOptions): void {
  mkdirSync(join(options.projectRoot, POLICY_DIR), { recursive: true })
  atomicWriteJson(policyPath(options.projectRoot), { allow: options.allow === true })
}
