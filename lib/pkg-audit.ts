/**
 * Pre-install security audit for pi packages (npm sources): fetches the
 * package's source files (via unpkg) and scans them for risky patterns
 * fetch-and-execute hooks, credential exfiltration, obfuscated payloads,
 * pipe-to-shell installers. Heuristic by nature; findings are advisory and
 * always shown before anything gets installed. npm sources are fetched via
 * unpkg; remote Git sources get a shallow clone and local directories are
 * scanned in place.
 */
import { execFile } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { promisify } from "node:util"
import { atomicWriteJson } from "./config-io.ts"

const execFileAsync = promisify(execFile)

export interface AuditFinding {
  severity: "high" | "warn" | "info"
  file: string
  line: number
  excerpt: string
  reason: string
}

export interface PackageAudit {
  name: string
  version: string
  installSpec?: string
  integrity?: string
  ok: boolean
  complete: boolean
  filesSelected: number
  filesFetched: number
  filesSkipped: string[]
  error?: string
  filesScanned: number
  bytesScanned: number
  findings: AuditFinding[]
  domains: string[]
}

const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sh"]
const MAX_FILES = 60
const MAX_BYTES = 1_500_000
const FETCH_TIMEOUT_MS = 12_000

function auditReceiptsDir(dataDir: string): string {
  return join(dataDir, "audit-receipts")
}

function auditReceiptPath(dataDir: string, name: string, version: string): string {
  return join(auditReceiptsDir(dataDir), `${encodeURIComponent(`${name}@${version}`)}.json`)
}

function isPackageAudit(value: unknown, name: string, version: string): value is PackageAudit {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const audit = value as Partial<PackageAudit>
  return (
    audit.name === name &&
    audit.version === version &&
    typeof audit.ok === "boolean" &&
    typeof audit.complete === "boolean" &&
    typeof audit.filesSelected === "number" &&
    typeof audit.filesFetched === "number" &&
    Array.isArray(audit.filesSkipped) &&
    typeof audit.filesScanned === "number" &&
    typeof audit.bytesScanned === "number" &&
    Array.isArray(audit.findings) &&
    Array.isArray(audit.domains)
  )
}

/** Persist an immutable audit receipt under its exact package identity. */
export function saveAuditReceipt(dataDir: string, audit: PackageAudit): void {
  mkdirSync(auditReceiptsDir(dataDir), { recursive: true })
  atomicWriteJson(auditReceiptPath(dataDir, audit.name, audit.version), audit)
}

/** Load only a receipt whose stored identity matches the requested identity. */
export function loadAuditReceipt(dataDir: string, name: string, version: string): PackageAudit | undefined {
  const path = auditReceiptPath(dataDir, name, version)
  if (!existsSync(path)) return undefined
  try {
    const audit = JSON.parse(readFileSync(path, "utf-8")) as unknown
    return isPackageAudit(audit, name, version) ? audit : undefined
  } catch {
    return undefined
  }
}

function splitLines(src: string): string[] {
  return src.split("\n")
}

function hasNetwork(src: string): boolean {
  return /\b(fetch|axios|http\.request|https\.request|XMLHttpRequest|WebSocket|net\.connect)\b/.test(src)
}

function isMinified(src: string): boolean {
  const lines = splitLines(src)
  return lines.length > 0 && lines.length < 25 && src.length > 3000
}

/**
 * Pure pattern scanner over a package's source files ({path: content}).
 * Network-free so it's fully unit-testable.
 */
export function scanSources(sources: Record<string, string>, pkgJson?: unknown): { findings: AuditFinding[]; domains: string[] } {
  const findings: AuditFinding[] = []
  const domains = new Set<string>()

  const push = (severity: AuditFinding["severity"], file: string, line: number, excerpt: string, reason: string) => {
    findings.push({ severity, file, line, excerpt: excerpt.trim().slice(0, 160), reason })
  }

  // install scripts from package.json
  if (pkgJson && typeof pkgJson === "object") {
    const scripts = (pkgJson as Record<string, unknown>).scripts as Record<string, string> | undefined
    if (scripts) {
      for (const [name, cmd] of Object.entries(scripts)) {
        if (typeof cmd !== "string") continue
        if (/^(pre|post)?install|prepare$/.test(name)) {
          const pipeShell = /(\bcurl|\bwget)\b[^\n;]*\|\s*(ba|z|zsh|s)?sh\b/.test(cmd)
          push(pipeShell ? "high" : "warn", "package.json", 0, `"${name}": "${cmd}"`, pipeShell ? "install script pipes a download into a shell" : `runs an install-time script (${name}) - review it`)
        }
      }
    }
  }

  for (const [file, content] of Object.entries(sources)) {
    if (!SCAN_EXTENSIONS.some((ext) => file.endsWith(ext))) continue
    const lines = splitLines(content)
    const network = hasNetwork(content)
    const minified = isMinified(content)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const at = i + 1

      for (const m of line.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        domains.add(m[1]!)
      }

      // dynamic code execution
      if (/\beval\s*\(|new\s+Function\s*\(/.test(line)) {
        push(network ? "high" : "warn", file, at, line, network ? "dynamic code execution in a file that also performs network requests" : "dynamic code execution (eval/new Function)")
      }

      // base64/decode feeding execution
      if (/(atob\(|"base64"|'base64')/.test(line) && lines.slice(i, i + 4).some((l) => /eval|new\s+Function|exec/.test(l))) {
        push("high", file, at, line, "decoded payload feeding dynamic execution (possible obfuscation)")
      }

      // shell execution
      if (/\b(execSync|exec|spawnSync|spawn)\s*\(/.test(line) && /child_process|require\(['"]child/.test(content)) {
        const safeLiteral = /\b(execSync|exec|spawnSync|spawn)\s*\(\s*["'](ps|tasklist|taskkill|ls|dir|echo|which|uname|git|node|npm|npx)["']/.test(line)
        if (network && !safeLiteral) {
          push("high", file, at, line, "spawns processes in a file that also performs network requests")
        } else if (network && safeLiteral) {
          push("info", file, at, line, "spawns common process-inspection commands alongside network code")
        } else {
          push("info", file, at, line, "spawns shell processes (common for pi tools - verify the commands)")
        }
      }

      // pipe-to-shell anywhere in code
      if (/(\bcurl|\bwget)\b[^\n]*\|\s*(ba)?sh\b/.test(line)) {
        push("high", file, at, line, "downloads piped straight into a shell")
      }

      // credential harvesting + network
      if (/(\.ssh\b|\.aws\/credentials|\.netrc|keychain|auth\.json|\.config\/gcloud|\.kube\/config)/.test(line) && network) {
        push("high", file, at, line, "reads credential material in a file that also performs network requests")
      }

      // whole-env exfiltration
      if (/JSON\.stringify\s*\(\s*(process\.)?env\b/.test(line) && network) {
        push("high", file, at, line, "serializes the entire environment in a file that also performs network requests")
      }

      // pi credential store access
      if (/\.pi\/agent\/auth|auth\.json/.test(line) && !file.endsWith("package.json")) {
        push("warn", file, at, line, "references pi's credential storage (auth.json) - legitimate for key managers, verify usage")
      }
    }

    if (minified && network) {
      push("warn", file, 1, `(${content.length} bytes on ${lines.length} lines)`, "minified bundle with network access - hard to review; prefer source packages")
    }
  }

  return { findings, domains: [...domains] }
}

interface UnpkgMetaNode {
  path: string
  type?: string
  size?: number
  files?: UnpkgMetaNode[]
}

interface UnpkgMeta {
  version?: string
  path?: string
  type?: string
  size?: number
  files?: UnpkgMetaNode[]
}

interface NpmRegistryIdentity {
  version?: unknown
  dist?: {
    integrity?: unknown
  }
}

/**
 * Collect (path, size) pairs from unpkg's ?meta payload, which exists in two
 * shapes: flat ({version, files: [{path, size}]}) and nested directory trees.
 */
function flattenFiles(meta: UnpkgMeta): { path: string; size?: number }[] {
  const out: { path: string; size?: number }[] = []
  const walk = (node: UnpkgMetaNode): void => {
    if (node.files) {
      for (const f of node.files) walk(f)
      return
    }
    if (typeof node.path === "string" && node.path !== "/") {
      out.push({ path: node.path, size: node.size })
    }
  }
  if (Array.isArray(meta.files)) {
    for (const f of meta.files) walk(f)
  }
  return out
}

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS, headers?: HeadersInit): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers })
    if (!res.ok) return undefined
    return await res.text()
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function parsePackageIdentity(raw: string): { version: string; integrity: string } | undefined {
  try {
    const parsed = JSON.parse(raw) as NpmRegistryIdentity
    if (typeof parsed.version !== "string" || parsed.version === "") return undefined
    if (typeof parsed.dist?.integrity !== "string" || parsed.dist.integrity === "") return undefined
    return { version: parsed.version, integrity: parsed.dist.integrity }
  } catch {
    return undefined
  }
}

/** Fetch a public npm package's sources (unpkg) and audit them. */
export async function auditNpmPackage(name: string): Promise<PackageAudit> {
  const audit: PackageAudit = {
    name,
    version: "?",
    ok: false,
    complete: false,
    filesSelected: 0,
    filesFetched: 0,
    filesSkipped: [],
    filesScanned: 0,
    bytesScanned: 0,
    findings: [],
    domains: [],
  }
  const encoded = encodeURIComponent(name)
  const identityRaw = await fetchText(`https://registry.npmjs.org/${encoded}/latest`, FETCH_TIMEOUT_MS, { Accept: "application/json" })
  const identity = identityRaw === undefined ? undefined : parsePackageIdentity(identityRaw)
  if (!identity) {
    audit.error = "package identity could not be resolved"
    return audit
  }
  audit.version = identity.version
  audit.installSpec = `${name}@${identity.version}`
  audit.integrity = identity.integrity

  const unpkgBase = `https://unpkg.com/${encoded}@${encodeURIComponent(identity.version)}`
  const metaRaw = await fetchText(`${unpkgBase}/?meta`)
  if (metaRaw === undefined) {
    audit.error = "package not reachable on unpkg (private, new or unpublished)"
    return audit
  }
  let meta: UnpkgMeta
  try {
    meta = JSON.parse(metaRaw) as UnpkgMeta
  } catch {
    audit.error = "unpkg returned an unexpected payload"
    return audit
  }
  if (meta.version !== identity.version) {
    audit.error = "unpkg metadata version does not match resolved package identity"
    return audit
  }
  const all = flattenFiles(meta)
  const scanable = all
    .filter((f) => f.path.replace(/^\//, "") !== "package.json" && SCAN_EXTENSIONS.some((ext) => f.path.endsWith(ext)))
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0)) // small files first
  audit.filesSelected = scanable.length + 1
  const selected = scanable.slice(0, MAX_FILES)
  audit.filesSkipped.push(...scanable.slice(MAX_FILES).map((f) => f.path.replace(/^\//, "")))

  const sources: Record<string, string> = {}
  let bytes = 0
  for (const f of selected) {
    const path = f.path.replace(/^\//, "")
    if (bytes + (f.size ?? 0) > MAX_BYTES) {
      audit.filesSkipped.push(path)
      continue
    }
    const content = await fetchText(`${unpkgBase}/${path}`)
    if (content === undefined) {
      audit.filesSkipped.push(path)
      continue
    }
    sources[path] = content
    audit.filesFetched++
    bytes += content.length
  }

  const pkgRaw = await fetchText(`${unpkgBase}/package.json`)
  let pkgJson: unknown
  let packageJsonUsable = false
  let fatalError: string | undefined
  if (pkgRaw !== undefined) {
    try {
      const parsed = JSON.parse(pkgRaw) as unknown
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        if ((parsed as { version?: unknown }).version !== identity.version) {
          fatalError = "package.json version does not match resolved package identity"
          audit.filesSkipped.push("package.json")
        } else {
          pkgJson = parsed
          packageJsonUsable = true
          audit.filesFetched++
        }
      } else {
        audit.filesSkipped.push("package.json")
      }
    } catch {
      audit.filesSkipped.push("package.json")
    }
  } else {
    audit.filesSkipped.push("package.json")
  }

  const { findings, domains } = scanSources(sources, pkgJson)
  audit.findings = findings
  audit.domains = domains
  audit.filesScanned = audit.filesFetched
  audit.bytesScanned = bytes
  audit.complete = packageJsonUsable && audit.filesSkipped.length === 0 && audit.filesFetched === audit.filesSelected
  audit.ok = audit.complete
  if (fatalError) audit.error = fatalError
  else if (!audit.ok) audit.error = `incomplete audit: fetched ${audit.filesFetched}/${audit.filesSelected}`
  return audit
}

/** Return the exact npm target whose version and sources were audited. */
export function installTargetFromAudit(audit: PackageAudit): string | undefined {
  return audit.installSpec ? `npm:${audit.installSpec}` : undefined
}

/** Classify whether the audit completed, retained partial coverage or failed. */
export function auditStatus(audit: PackageAudit): "complete" | "incomplete" | "failed" {
  const coverageError = `incomplete audit: fetched ${audit.filesFetched}/${audit.filesSelected}`
  if (audit.filesSelected === 0 || (audit.error !== undefined && audit.error !== coverageError)) return "failed"
  if (!audit.complete || audit.error !== undefined) return "incomplete"
  return "complete"
}

export function formatAuditReport(a: PackageAudit): string[] {
  const lines: string[] = []
  lines.push("revisión heurística de fuentes seleccionadas")
  lines.push(auditStatus(a))
  lines.push(`security audit - ${a.name}@${a.version}`)
  lines.push("")
  if (a.error) {
    lines.push(`✗ ${a.error}`)
  }
  if (a.error && a.filesSelected === 0) {
    lines.push("", "Install proceeds at your own risk; review the repo manually.")
    return lines
  }
  const high = a.findings.filter((f) => f.severity === "high")
  const warn = a.findings.filter((f) => f.severity === "warn")
  const info = a.findings.filter((f) => f.severity === "info")
  if (a.error) lines.push("")
  lines.push(`coverage: ${a.filesSelected} selected · ${a.filesFetched} fetched · ${a.filesSkipped.length} skipped`)
  lines.push(`scanned ${a.filesScanned} files (${(a.bytesScanned / 1024).toFixed(0)}KB) · ${high.length} high · ${warn.length} warnings · ${info.length} info`)
  if (!a.complete && a.filesSkipped.length > 0) {
    lines.push("", "omissions:")
    for (const file of a.filesSkipped) lines.push(`  - ${file}`)
  }
  lines.push("")
  for (const f of [...high, ...warn]) {
    lines.push(`  [${f.severity}] ${f.file}:${f.line} - ${f.reason}`)
    lines.push(`        ${f.excerpt}`)
  }
  if (a.complete && !a.error && high.length + warn.length === 0) lines.push("  ✓ no high/warn findings in scanned sources")
  if (a.domains.length > 0) {
    lines.push("", `network endpoints referenced: ${a.domains.slice(0, 12).join(", ")}${a.domains.length > 12 ? " …" : ""}`)
  }
  lines.push("", "(heuristic scan - not a substitute for reading the code you install)")
  return lines
}

/** Quick verdict used by flows: block-worthy findings only. */
export function auditHasHighFindings(a: PackageAudit): boolean {
  return a.findings.some((f) => f.severity === "high")
}

function collectRepoFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules") continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...collectRepoFiles(full, base))
    } else if (e.isFile()) {
      out.push(relative(base, full))
    }
  }
  return out
}

type GitSourceKind = "local" | "remote"

/** Classify a Git source against the audit's closed allowlist. */
function gitSourceKind(source: string): GitSourceKind | undefined {
  if (source.trim() === "" || source.startsWith("-") || /[\x00-\x1f\x7f]/.test(source)) return undefined

  if (/^(https|ssh):\/\//i.test(source)) {
    try {
      const parsed = new URL(source)
      if (parsed.hostname && (parsed.protocol === "https:" || parsed.protocol === "ssh:")) return "remote"
    } catch {
      return undefined
    }
    return undefined
  }

  if (/^git@[^/:]+:.+/.test(source)) return "remote"
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return undefined
  return "local"
}

/**
 * Audit a Git source from the closed allowlist: HTTPS, SSH, Git's SCP-like
 * form, or a local directory path. Remote sources are shallow-cloned without
 * a shell and with the file and ext transports disabled. Existing local
 * directories are scanned in place so the file transport remains disabled.
 */
export async function auditGitSource(url: string): Promise<PackageAudit> {
  const audit: PackageAudit = {
    name: url,
    version: "git",
    ok: false,
    complete: false,
    filesSelected: 0,
    filesFetched: 0,
    filesSkipped: [],
    filesScanned: 0,
    bytesScanned: 0,
    findings: [],
    domains: [],
  }
  const sourceKind = gitSourceKind(url)
  if (!sourceKind) {
    audit.error = "unsupported git source"
    return audit
  }

  let localDir: string | undefined
  if (sourceKind === "local") {
    try {
      if (statSync(url).isDirectory()) localDir = url
    } catch {
      // Let git report a supported local path that does not exist.
    }
  }

  const dir = localDir ?? mkdtempSync(join(tmpdir(), "pi686-git-audit-"))
  try {
    if (!localDir) {
      try {
        await execFileAsync(
          "git",
          ["-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "clone", "--depth", "1", "--quiet", "--", url, dir],
          { timeout: 60_000 },
        )
      } catch (e) {
        audit.error = `clone failed: ${(e as Error).message.slice(0, 200)}`
        return audit
      }
    }
    const sources: Record<string, string> = {}
    let bytes = 0
    for (const rel of collectRepoFiles(dir)) {
      if (!SCAN_EXTENSIONS.some((ext) => rel.endsWith(ext))) continue
      if (Object.keys(sources).length >= MAX_FILES || bytes > MAX_BYTES) break
      try {
        const full = join(dir, rel)
        if (statSync(full).size > 400_000) continue
        const content = readFileSync(full, "utf-8")
        sources[rel] = content
        bytes += content.length
      } catch {
        // unreadable file - skip
      }
    }
    let pkgJson: unknown
    try {
      pkgJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"))
      audit.version = (pkgJson as { version?: string })?.version ?? "git"
    } catch {
      pkgJson = undefined
    }
    const { findings, domains } = scanSources(sources, pkgJson)
    audit.findings = findings
    audit.domains = domains
    audit.filesScanned = Object.keys(sources).length
    audit.complete = true
    audit.filesSelected = audit.filesScanned
    audit.filesFetched = audit.filesScanned
    audit.bytesScanned = bytes
    audit.ok = true
    return audit
  } finally {
    if (!localDir) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    }
  }
}
