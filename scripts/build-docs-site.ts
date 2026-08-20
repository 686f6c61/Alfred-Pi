/**
 * Regenera site/*.html desde los markdown públicos.
 * No copia docs/auditoria/. No editar el HTML a mano.
 */
import { join } from "node:path"
import { generateDocsSite } from "../lib/docs-site.ts"

const root = join(import.meta.dir, "..")
const written = generateDocsSite({
  docsDir: join(root, "docs"),
  outDir: join(root, "site"),
  extraPages: [
    { sourcePath: join(root, "CONTRIBUTING.md"), outputName: "CONTRIBUTING.html" },
    { sourcePath: join(root, "SECURITY.md"), outputName: "SECURITY.html" },
  ],
})

process.stdout.write(`site/: ${written.length} páginas\n${written.map((name) => `  ${name}`).join("\n")}\n`)
