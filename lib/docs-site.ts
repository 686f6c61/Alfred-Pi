import { mkdirSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"
import { atomicWriteText } from "./config-io.ts"

export interface DocsSiteExtraPage {
  /** Markdown absoluto o relativo al proceso. */
  sourcePath: string
  /** Nombre del HTML en outDir, por ejemplo CONTRIBUTING.html. */
  outputName: string
}

export interface DocsSiteOptions {
  docsDir: string
  outDir: string
  extraPages?: DocsSiteExtraPage[]
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function safeHref(raw: string): string {
  let href = raw.trim()
  if (/^(?:javascript|data|vbscript):/i.test(href)) return "#"
  href = href.replace(/\.md(?=#[^#]*$|$)/i, ".html")
  href = href.replace(/^\.\.\/(CONTRIBUTING|SECURITY)(\.html)(?=#|$)/i, "$1$2")
  return escapeHtml(href)
}

function renderInline(value: string): string {
  const tokens: string[] = []
  let rendered = value.replace(/`([^`]+)`/g, (_match, content: string) => {
    const index = tokens.push(`<code>${escapeHtml(content)}</code>`) - 1
    return `\u0000TOKEN${index}\u0000`
  })
  rendered = rendered.replace(/\[([^\]]+)]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g, (_match, label: string, href: string) => {
    const index = tokens.push(`<a href="${safeHref(href)}">${escapeHtml(label)}</a>`) - 1
    return `\u0000TOKEN${index}\u0000`
  })
  rendered = escapeHtml(rendered)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
  return rendered.replace(/\u0000TOKEN(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "")
}

function headingId(value: string): string {
  const id = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return id || "seccion"
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
}

function renderMarkdown(markdown: string): { title: string; body: string } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const out: string[] = []
  let title = "Documentación"
  let paragraph: string[] = []
  let list: "ul" | "ol" | undefined
  let inCode = false
  let codeLanguage = ""
  let codeLines: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    out.push(`<p>${renderInline(paragraph.join(" "))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (!list) return
    out.push(`</${list}>`)
    list = undefined
  }
  const flushCode = () => {
    const className = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""
    out.push(`<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code></pre>`)
    codeLanguage = ""
    codeLines = []
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const fence = line.match(/^\s*```\s*([^\s`]*)/)
    if (fence) {
      if (inCode) {
        flushCode()
        inCode = false
      } else {
        flushParagraph()
        closeList()
        inCode = true
        codeLanguage = fence[1] ?? ""
      }
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1]!.length
      const text = heading[2]!
      if (level === 1 && title === "Documentación") title = text
      out.push(`<h${level} id="${headingId(text)}">${renderInline(text)}</h${level}>`)
      continue
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? "")) {
      flushParagraph()
      closeList()
      const headers = tableCells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        rows.push(tableCells(lines[index] ?? ""))
        index++
      }
      index--
      out.push("<table><thead><tr>", ...headers.map((cell) => `<th>${renderInline(cell)}</th>`), "</tr></thead><tbody>")
      for (const row of rows) out.push("<tr>", ...row.map((cell) => `<td>${renderInline(cell)}</td>`), "</tr>")
      out.push("</tbody></table>")
      continue
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const nextList = unordered ? "ul" : "ol"
      if (list !== nextList) {
        closeList()
        list = nextList
        out.push(`<${list}>`)
      }
      out.push(`<li>${renderInline((unordered?.[1] ?? ordered?.[1])!)}</li>`)
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      closeList()
      out.push(`<blockquote>${renderInline(quote[1] ?? "")}</blockquote>`)
      continue
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph()
      closeList()
      out.push("<hr>")
      continue
    }

    if (line.trim() === "") {
      flushParagraph()
      closeList()
      continue
    }
    closeList()
    paragraph.push(line.trim())
  }

  if (inCode) flushCode()
  flushParagraph()
  closeList()
  return { title, body: out.join("\n") }
}

function pageHtml(title: string, body: string, nav: { href: string; label: string }[]): string {
  const navItems = nav
    .map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
    .join("")
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · pi-harness-moe</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.6; }
    body { max-width: 76rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    a { color: #3976d8; }
    nav { display: flex; flex-wrap: wrap; gap: .35rem 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #8886; }
    pre, code { font-family: ui-monospace, monospace; }
    pre { overflow-x: auto; padding: 1rem; border: 1px solid #8886; border-radius: .5rem; }
    table { width: 100%; border-collapse: collapse; overflow-x: auto; }
    th, td { padding: .5rem; border: 1px solid #8886; text-align: left; vertical-align: top; }
    blockquote { margin-left: 0; padding-left: 1rem; border-left: .25rem solid #8886; }
    footer { margin-top: 3rem; font-size: .9rem; opacity: .8; }
  </style>
</head>
<body>
<nav>${navItems}</nav>
<main>${body}</main>
<footer>Fuente: markdown en <code>docs/</code>. No editar este HTML a mano. Regenerar con <code>bun scripts/build-docs-site.ts</code>.</footer>
</body>
</html>
`
}

function publicMarkdownFiles(docsDir: string, dir = docsDir): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === "auditoria") continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...publicMarkdownFiles(docsDir, path))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(relative(docsDir, path))
  }
  return files.sort()
}

/** Genera páginas HTML desde los Markdown públicos y excluye la auditoría. */
export function generateDocsSite(options: DocsSiteOptions): string[] {
  mkdirSync(options.outDir, { recursive: true })
  const pages: { htmlPath: string; title: string; body: string }[] = []
  for (const markdownPath of publicMarkdownFiles(options.docsDir)) {
    const source = readFileSync(join(options.docsDir, markdownPath), "utf-8")
    const rendered = renderMarkdown(source)
    const htmlPath = markdownPath.replace(/\.md$/i, ".html")
    pages.push({ htmlPath, title: rendered.title || basename(htmlPath, ".html"), body: rendered.body })
  }
  for (const extra of options.extraPages ?? []) {
    const source = readFileSync(extra.sourcePath, "utf-8")
    const rendered = renderMarkdown(source)
    const htmlPath = extra.outputName.replace(/\.md$/i, ".html")
    pages.push({ htmlPath, title: rendered.title || basename(htmlPath, ".html"), body: rendered.body })
  }
  const nav = pages.map((page) => ({ href: page.htmlPath, label: page.title }))
  const outputs: string[] = []
  for (const page of pages) {
    const output = join(options.outDir, page.htmlPath)
    mkdirSync(dirname(output), { recursive: true })
    atomicWriteText(output, pageHtml(page.title, page.body, nav))
    outputs.push(page.htmlPath)
  }
  return outputs
}
