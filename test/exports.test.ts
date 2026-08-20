import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

/**
 * Guards against the "not a function" class of bug: runtime entry points
 * import names from lib modules, but jiti does no type-checking. A missing
 * `export` therefore only explodes when the affected command runs.
 */
const ROOT = new URL("..", import.meta.url).pathname
const LIB_DIR = resolve(ROOT, "lib")
const ENTRY_FILES = ["index.ts", "lib/screens.ts", "lib/onboarding-flow.ts"] as const

interface NamedImport {
  names: string
  spec: string
  dynamic: boolean
}

function namedImports(source: string): NamedImport[] {
  const staticImports = [...source.matchAll(/import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)]
    .map(([, names, spec]) => ({ names: names!, spec: spec!, dynamic: false }))
  const dynamicImports = [...source.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*await\s*import\(\s*["']([^"']+)["']\s*\)/g)]
    .map(([, names, spec]) => ({ names: names!, spec: spec!, dynamic: true }))

  return [...staticImports, ...dynamicImports]
}

function resolveLibModule(importer: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined

  const modulePath = resolve(dirname(importer), `${spec.replace(/\.ts$/, "")}.ts`)
  const pathWithinLib = relative(LIB_DIR, modulePath)
  if (pathWithinLib.startsWith("..") || pathWithinLib === "") return undefined
  return modulePath
}

function sourceExports(source: string, name: string): boolean {
  const declaration = new RegExp(`export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|class|let|var|type|interface|enum)\\s+${name}\\b`)
  if (declaration.test(source)) return true

  return [...source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)].some(([, names]) =>
    names!.split(",").some((raw) => {
      const exportedName = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).at(-1)?.trim()
      return exportedName === name
    }),
  )
}

test("all_imports_from_three_files_exist_in_lib", () => {
  const moduleCache = new Map<string, string>()
  let checkedNames = 0
  let checkedDynamicNames = 0

  for (const entry of ENTRY_FILES) {
    const importer = resolve(ROOT, entry)
    const source = readFileSync(importer, "utf-8")
    const imports = namedImports(source)
      .map((found) => ({ ...found, modulePath: resolveLibModule(importer, found.spec) }))
      .filter((found): found is NamedImport & { modulePath: string } => found.modulePath !== undefined)

    expect(imports.length, `${entry} should import named exports from lib/`).toBeGreaterThan(0)

    for (const { names, spec, dynamic, modulePath } of imports) {
      let moduleSource = moduleCache.get(modulePath)
      if (moduleSource === undefined) {
        moduleSource = readFileSync(modulePath, "utf-8")
        moduleCache.set(modulePath, moduleSource)
      }

      for (const raw of names.split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()
        if (!name) continue

        expect(sourceExports(moduleSource, name), `${entry}: ${spec} should export "${name}"`).toBe(true)
        checkedNames += 1
        if (dynamic) checkedDynamicNames += 1
      }
    }
  }

  expect(checkedNames).toBeGreaterThan(5)
  expect(checkedDynamicNames, "index.ts dynamic named imports should be guarded").toBeGreaterThan(0)
})
