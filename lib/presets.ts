/**
 * Known-provider presets so users don't paste base URLs by hand.
 * Keys are referenced through env vars - never stored as literals.
 */
import type { ApiType, CredentialPolicy } from "./config-io.ts"

export interface ProviderPreset {
  id: string
  label: string
  api: ApiType
  baseUrl: string
  credentialPolicy?: CredentialPolicy
  keyEnv?: string
  keyLiteral?: string
  /** Cabeceras extra (p. ej. api-key de Azure) con refs $ENV resueltas al usar. */
  headers?: Record<string, string>
  note?: string
  compat?: { supportsDeveloperRole?: boolean }
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // --- coding-model vendors -----------------------------------------------
  {
    id: "xai-grok",
    label: "xAI - Grok / Grok Code",
    api: "openai-completions",
    baseUrl: "https://api.x.ai/v1",
    credentialPolicy: { authorizedOrigin: "https://api.x.ai" },
    keyEnv: "XAI_API_KEY",
    note: "Grok models incl. Grok Code Fast, tuned for coding agents.",
  },
  {
    id: "moonshot-kimi",
    label: "Moonshot - Kimi (K2 / K2 Code)",
    api: "openai-completions",
    baseUrl: "https://api.moonshot.ai/v1",
    credentialPolicy: { authorizedOrigin: "https://api.moonshot.ai" },
    keyEnv: "MOONSHOT_API_KEY",
    note: "Kimi K2 and K2 Code models.",
  },
  {
    id: "moonshot-kimi-anthropic",
    label: "Moonshot - Kimi (Anthropic-compatible)",
    api: "anthropic-messages",
    baseUrl: "https://api.moonshot.ai/anthropic",
    credentialPolicy: { authorizedOrigin: "https://api.moonshot.ai" },
    keyEnv: "MOONSHOT_API_KEY",
    note: "No model discovery on this endpoint - add ids by hand (e.g. kimi-k2-0905-preview).",
  },
  {
    id: "openai-codex",
    label: "OpenAI - Codex models",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    credentialPolicy: { authorizedOrigin: "https://api.openai.com" },
    keyEnv: "OPENAI_API_KEY",
    note: "Codex models are Responses-API optimized. ChatGPT subscription? Use pi /login instead.",
  },
  {
    id: "anthropic-claude",
    label: "Anthropic - Claude (API key)",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    credentialPolicy: { authorizedOrigin: "https://api.anthropic.com" },
    keyEnv: "ANTHROPIC_API_KEY",
    note: "Merges with pi's built-in anthropic provider. Claude Pro/Max subscription? Use pi /login.",
  },
  {
    id: "zai-glm",
    label: "z.ai - GLM (Anthropic-compatible)",
    api: "anthropic-messages",
    baseUrl: "https://api.z.ai/api/anthropic",
    credentialPolicy: { authorizedOrigin: "https://api.z.ai" },
    keyEnv: "ZAI_API_KEY",
    note: "GLM-4.x/GLM-5 models, pay-as-you-go API.",
  },
  {
    id: "zai-coding",
    label: "z.ai - GLM Coding Plan",
    api: "anthropic-messages",
    baseUrl: "https://api.z.ai/api/coding",
    credentialPolicy: { authorizedOrigin: "https://api.z.ai" },
    keyEnv: "ZAI_API_KEY",
    note: "Endpoint for GLM Coding Plan subscribers.",
  },
  {
    id: "ollama-cloud",
    label: "Ollama Cloud (remote)",
    api: "openai-completions",
    baseUrl: "https://ollama.com/v1",
    credentialPolicy: { authorizedOrigin: "https://ollama.com" },
    keyEnv: "OLLAMA_API_KEY",
    compat: { supportsDeveloperRole: false },
    note: "Remote cloud models (glm-5.2, kimi-k2.7-code, deepseek-v4…). Key at ollama.com/settings/keys.",
  },
  // --- gateways & general APIs --------------------------------------------
  {
    id: "google-gemini",
    label: "Google - Gemini (AI Studio)",
    api: "google-generative-ai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    credentialPolicy: { authorizedOrigin: "https://generativelanguage.googleapis.com" },
    keyEnv: "GEMINI_API_KEY",
    note: "Gemini con capa gratis en AI Studio. ¿Vertex o Code Assist? Usa el acceso nativo de Google con pi /login.",
  },
  {
    id: "qwen",
    label: "Alibaba - Qwen (Model Studio)",
    api: "openai-completions",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    credentialPolicy: { authorizedOrigin: "https://dashscope-intl.aliyuncs.com" },
    keyEnv: "DASHSCOPE_API_KEY",
    note: "Región internacional. Qwen3-Coder es de los modelos abiertos más usados en agentes.",
  },
  {
    id: "minimax",
    label: "MiniMax - M2 / Coding Plan",
    api: "openai-completions",
    baseUrl: "https://api.minimax.io/v1",
    credentialPolicy: { authorizedOrigin: "https://api.minimax.io" },
    keyEnv: "MINIMAX_API_KEY",
    note: "MiniMax M2 y su plan de código: barato y rápido para agentes.",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    api: "openai-completions",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    credentialPolicy: { authorizedOrigin: "https://integrate.api.nvidia.com" },
    keyEnv: "NVIDIA_API_KEY",
    note: "DeepSeek, Qwen y Llama hosted por NVIDIA, con tiers gratuitos.",
  },
  {
    id: "perplexity",
    label: "Perplexity - Sonar",
    api: "openai-completions",
    baseUrl: "https://api.perplexity.ai",
    credentialPolicy: { authorizedOrigin: "https://api.perplexity.ai" },
    keyEnv: "PERPLEXITY_API_KEY",
    note: "Sonar con búsqueda en vivo. Sin endpoint /models: la sonda puede fallar y se guarda igualmente.",
  },
  {
    id: "hugging-face",
    label: "Hugging Face Router",
    api: "openai-completions",
    baseUrl: "https://router.huggingface.co/v1",
    credentialPolicy: { authorizedOrigin: "https://router.huggingface.co" },
    keyEnv: "HF_TOKEN",
    note: "Un solo token para cientos de modelos del hub.",
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI / AI Foundry (avanzado)",
    api: "openai-completions",
    baseUrl: "https://TU-RECURSO.openai.azure.com/openai/v1",
    keyEnv: "AZURE_OPENAI_API_KEY",
    headers: { "api-key": "$AZURE_OPENAI_API_KEY" },
    note: "Edita TU-RECURSO por el nombre de tu recurso; el modelo es el nombre del deployment. Requiere la API v1.",
  },
  {
    id: "bedrock",
    label: "Amazon Bedrock (vía gateway LiteLLM)",
    api: "openai-completions",
    baseUrl: "http://localhost:4000/v1",
    keyEnv: "LITELLM_KEY",
    note: "Bedrock exige firma AWS: corre un gateway LiteLLM local o propio y apunta aquí; los modelos se nombran bedrock/…",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    credentialPolicy: { authorizedOrigin: "https://openrouter.ai" },
    keyEnv: "OPENROUTER_API_KEY",
    note: "Gateway to hundreds of models with one key.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1",
    credentialPolicy: { authorizedOrigin: "https://api.deepseek.com" },
    keyEnv: "DEEPSEEK_API_KEY",
  },
  {
    id: "groq",
    label: "Groq",
    api: "openai-completions",
    baseUrl: "https://api.groq.com/openai/v1",
    credentialPolicy: { authorizedOrigin: "https://api.groq.com" },
    keyEnv: "GROQ_API_KEY",
  },
  {
    id: "together",
    label: "Together AI",
    api: "openai-completions",
    baseUrl: "https://api.together.xyz/v1",
    credentialPolicy: { authorizedOrigin: "https://api.together.xyz" },
    keyEnv: "TOGETHER_API_KEY",
  },
  {
    id: "mistral",
    label: "Mistral",
    api: "openai-completions",
    baseUrl: "https://api.mistral.ai/v1",
    credentialPolicy: { authorizedOrigin: "https://api.mistral.ai" },
    keyEnv: "MISTRAL_API_KEY",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    api: "openai-completions",
    baseUrl: "https://api.cerebras.ai/v1",
    credentialPolicy: { authorizedOrigin: "https://api.cerebras.ai" },
    keyEnv: "CEREBRAS_API_KEY",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    api: "openai-completions",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    credentialPolicy: { authorizedOrigin: "https://api.fireworks.ai" },
    keyEnv: "FIREWORKS_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI (general)",
    api: "openai-completions",
    baseUrl: "https://api.openai.com/v1",
    credentialPolicy: { authorizedOrigin: "https://api.openai.com" },
    keyEnv: "OPENAI_API_KEY",
  },
  // --- local / own inference servers --------------------------------------
  {
    id: "ollama",
    label: "Ollama (local)",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:11434/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:11434", allowInsecureLoopback: true },
    keyLiteral: "ollama",
    compat: { supportsDeveloperRole: false },
    note: "No key needed. Cloud models use a `:cloud` suffix and `ollama signin` - or see /ollama.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1234/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:1234", allowInsecureLoopback: true },
    keyLiteral: "lm-studio",
    compat: { supportsDeveloperRole: false },
  },
  {
    id: "vllm",
    label: "vLLM (own server)",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:8000/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:8000", allowInsecureLoopback: true },
    keyLiteral: "none",
    compat: { supportsDeveloperRole: false },
    note: "Serves any HF model with the OpenAI API.",
  },
  {
    id: "sglang",
    label: "SGLang (own server)",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:30000/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:30000", allowInsecureLoopback: true },
    keyLiteral: "none",
    compat: { supportsDeveloperRole: false },
    note: "Fast local inference with OpenAI-compatible endpoints.",
  },
  {
    id: "litellm",
    label: "LiteLLM proxy",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:4000/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:4000", allowInsecureLoopback: true },
    keyEnv: "LITELLM_API_KEY",
    compat: { supportsDeveloperRole: false },
    note: "Point this at your proxy port.",
  },
  {
    id: "custom-openai",
    label: "Custom OpenAI-compatible server…",
    api: "openai-completions",
    baseUrl: "http://localhost:8000/v1",
    note: "Any inference server speaking the OpenAI API (TGI, TabbyAPI, your own).",
  },
]

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

/** Validate provider ids before they become config keys and CLI tokens. */
export function isValidProviderId(id: string): boolean {
  return !(/^\d|\s|\.|\/|#/.test(id))
}
