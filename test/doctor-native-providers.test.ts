import { expect, test } from "bun:test"
import { checkConfigs } from "../lib/doctor.ts"
import type { AuthFile } from "../lib/config-io.ts"

// Estas pruebas fijan el contrato de credenciales que expone pi. El doctor
// no debe confundir una variable de nombre parecido con una credencial útil.
function issuesFor(provider: string, auth: AuthFile = {}, env: NodeJS.ProcessEnv = {}) {
  return checkConfigs({
    models: { providers: {} },
    auth,
    settings: { defaultProvider: provider },
    env,
  })
}

function lacksEffectiveCredential(provider: string, auth: AuthFile = {}, env: NodeJS.ProcessEnv = {}): boolean {
  return issuesFor(provider, auth, env).some((issue) => issue.message.includes("credencial efectiva"))
}

test("el doctor reconoce las variables exactas de los proveedores nativos", () => {
  const cases: [string, NodeJS.ProcessEnv][] = [
    ["azure-openai-responses", { AZURE_OPENAI_API_KEY: "azure" }],
    ["amazon-bedrock", { AWS_PROFILE: "trabajo" }],
    ["nvidia", { NVIDIA_API_KEY: "nvidia" }],
    ["google", { GEMINI_API_KEY: "gemini" }],
    ["github-copilot", { COPILOT_GITHUB_TOKEN: "copilot" }],
    ["llama.cpp", { LLAMA_BASE_URL: "http://127.0.0.1:8080" }],
  ]

  for (const [provider, env] of cases) {
    expect(issuesFor(provider, {}, env), provider).toEqual([])
  }
})

test("el doctor rechaza variables parecidas que pi no usa", () => {
  const cases: [string, NodeJS.ProcessEnv][] = [
    ["azure-openai-responses", { AZURE_API_KEY: "no-es-azure-openai" }],
    ["nvidia", { NVIDIA_NIM_API_KEY: "no-es-nvidia" }],
    ["google", { GOOGLE_API_KEY: "no-es-gemini" }],
    ["amazon-bedrock", { AWS_ACCESS_KEY_ID: "incompleta" }],
    ["github-copilot", { GITHUB_TOKEN: "no-es-copilot" }],
    ["llama.cpp", { LLAMA_API_KEY: "sin-servidor" }],
  ]

  for (const [provider, env] of cases) {
    expect(lacksEffectiveCredential(provider, {}, env), provider).toBe(true)
  }
})

test("Bedrock acepta únicamente fuentes completas de la cadena de AWS", () => {
  const valid: NodeJS.ProcessEnv[] = [
    { AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" },
    { AWS_BEARER_TOKEN_BEDROCK: "bearer" },
    { AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials" },
    { AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://169.254.170.2/credentials" },
    { AWS_WEB_IDENTITY_TOKEN_FILE: "/var/run/secrets/token" },
  ]

  for (const env of valid) {
    expect(lacksEffectiveCredential("amazon-bedrock", {}, env)).toBe(false)
  }
})

test("el entorno guardado en auth.json prevalece al resolver la credencial", () => {
  const azureAuth: AuthFile = {
    "azure-openai-responses": {
      type: "api_key",
      key: "$AZURE_OPENAI_API_KEY",
      env: { AZURE_OPENAI_API_KEY: "guardada" },
    },
  }
  const bedrockAuth: AuthFile = {
    "amazon-bedrock": { type: "api_key", env: { AWS_PROFILE: "guardado" } },
  }
  const llamaAuth: AuthFile = {
    "llama.cpp": { type: "api_key", env: { LLAMA_BASE_URL: "http://127.0.0.1:8080" } },
  }

  expect(lacksEffectiveCredential("azure-openai-responses", azureAuth)).toBe(false)
  expect(issuesFor("azure-openai-responses", azureAuth).some((issue) => issue.message.includes("AZURE_OPENAI_API_KEY"))).toBe(false)
  expect(lacksEffectiveCredential("amazon-bedrock", bedrockAuth)).toBe(false)
  expect(lacksEffectiveCredential("llama.cpp", llamaAuth)).toBe(false)
})

test("OAuth solo cuenta en proveedores que pi autentica mediante OAuth", () => {
  const oauth = { type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 60_000 }

  expect(lacksEffectiveCredential("github-copilot", { "github-copilot": oauth })).toBe(false)
  expect(lacksEffectiveCredential("openai-codex", { "openai-codex": oauth })).toBe(false)
  expect(lacksEffectiveCredential("azure-openai-responses", { "azure-openai-responses": oauth })).toBe(true)
  expect(lacksEffectiveCredential("openai-codex", { "openai-codex": { type: "api_key", key: "no-es-oauth" } })).toBe(true)
})
