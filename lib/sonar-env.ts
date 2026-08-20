import { chmodSync, existsSync, statSync } from "node:fs"
import { atomicWriteText } from "./config-io.ts"

const PRIVATE_MODE = 0o600
const PERMISSIONS_OUTSIDE_PRIVATE_MODE = 0o177

export interface SonarEnvVars {
  token: string
  url: string
}

/** Persist only the reusable SonarQube values in an owner-only env file. */
export async function writeSonarEnv(path: string, vars: SonarEnvVars): Promise<void> {
  if (existsSync(path)) {
    const currentMode = statSync(path).mode & 0o777
    if ((currentMode & PERMISSIONS_OUTSIDE_PRIVATE_MODE) !== 0) {
      throw new Error(`Refusing to overwrite ${path}: permissions must not exceed 0600`)
    }
  }

  const content = `SONAR_URL=${vars.url}\nSONAR_TOKEN=${vars.token}\n`
  atomicWriteText(path, content, PRIVATE_MODE)
  chmodSync(path, PRIVATE_MODE)
}
