/**
 * pi package registry access (npm as the backend): keyword search, package
 * info and monthly downloads. Powers the /packages browser. Pure Node.
 */

export interface RegistryPackage {
  name: string
  version?: string
  description?: string
  publisher?: string
  date?: string
  downloads?: number
}

export interface PackageDetail {
  name: string
  version: string
  description?: string
  editor?: string
  publishedAt?: string
  homepage?: string
  repository?: string
  license?: string
  type?: string
  unpackedSize?: number
  dependencies: string[]
  peerDependencies: string[]
  readmeHead?: string
  piManifest?: { extensions?: string[]; skills?: string[]; prompts?: string[]; themes?: string[] }
}

interface RegistryPiManifest {
  extensions?: unknown
  skills?: unknown
  prompts?: unknown
  themes?: unknown
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
  return entries.length > 0 ? entries : undefined
}

function parsePiManifest(value: unknown): PackageDetail["piManifest"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const manifest = value as RegistryPiManifest
  const parsed: NonNullable<PackageDetail["piManifest"]> = {}
  const extensions = stringList(manifest.extensions)
  const skills = stringList(manifest.skills)
  const prompts = stringList(manifest.prompts)
  const themes = stringList(manifest.themes)
  if (extensions) parsed.extensions = extensions
  if (skills) parsed.skills = skills
  if (prompts) parsed.prompts = prompts
  if (themes) parsed.themes = themes
  return Object.keys(parsed).length > 0 ? parsed : undefined
}

function editorName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const name = (value as { name?: unknown }).name
    if (typeof name === "string" && name.trim()) return name.trim()
  }
  return undefined
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return undefined
    return (await res.json()) as T
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** Search npm for pi packages matching a query (keyword pi-package). */
export async function searchPiPackages(query: string, limit = 20): Promise<RegistryPackage[]> {
  const text = query.trim() ? `keywords:pi-package ${query.trim()}` : "keywords:pi-package"
  const data = await fetchJson<{ objects?: { package: { name: string; version?: string; description?: string; publisher?: { username?: string }; date?: string } }[] }>(
    `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=${limit}`,
  )
  return (data?.objects ?? []).map((o) => ({
    name: o.package.name,
    version: o.package.version,
    description: o.package.description,
    publisher: o.package.publisher?.username,
    date: o.package.date,
  }))
}

/** Monthly downloads for a package (best-effort). */
export async function packageDownloads(name: string): Promise<number | undefined> {
  const data = await fetchJson<{ downloads?: number }>(
    `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(name).replace("%40", "@")}`,
  )
  return data?.downloads
}

/** Full detail for a package from its registry metadata. */
export async function packageDetail(name: string): Promise<PackageDetail | undefined> {
  const data = await fetchJson<{
    "dist-tags"?: { latest?: string }
    time?: Record<string, string>
    maintainers?: unknown[]
    versions?: Record<string, {
      description?: string
      homepage?: string
      repository?: unknown
      license?: unknown
      type?: unknown
      author?: unknown
      _npmUser?: unknown
      dist?: { unpackedSize?: unknown }
      dependencies?: unknown
      peerDependencies?: unknown
      pi?: unknown
    }>
    readme?: string
  }>(`https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`)
  if (!data?.["dist-tags"]?.latest) return undefined
  const version = data["dist-tags"].latest
  const meta = data.versions?.[version] ?? {}
  const repository = typeof meta.repository === "string" ? meta.repository : (meta.repository as { url?: string } | undefined)?.url
  const dependencies =
    meta.dependencies !== null && typeof meta.dependencies === "object" && !Array.isArray(meta.dependencies)
      ? Object.keys(meta.dependencies as Record<string, unknown>)
      : []
  const peerDependencies =
    meta.peerDependencies !== null && typeof meta.peerDependencies === "object" && !Array.isArray(meta.peerDependencies)
      ? Object.keys(meta.peerDependencies as Record<string, unknown>)
      : []
  return {
    name,
    version,
    description: meta.description,
    editor: editorName(meta._npmUser) ?? editorName(meta.author) ?? editorName(data.maintainers?.[0]),
    publishedAt: typeof data.time?.[version] === "string" ? data.time[version] : undefined,
    homepage: meta.homepage,
    repository,
    license: typeof meta.license === "string" ? meta.license : undefined,
    type: typeof meta.type === "string" ? meta.type : undefined,
    unpackedSize:
      typeof meta.dist?.unpackedSize === "number" && Number.isFinite(meta.dist.unpackedSize) && meta.dist.unpackedSize >= 0
        ? meta.dist.unpackedSize
        : undefined,
    dependencies,
    peerDependencies,
    readmeHead: (data.readme ?? "").replace(/<[^>]+>/g, "").slice(0, 1200),
    piManifest: parsePiManifest(meta.pi),
  }
}
