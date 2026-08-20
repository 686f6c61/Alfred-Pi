/**
 * Minimal unified-diff for config previews. LCS-based; config files are small
 * so O(n*m) is fine and keeps this dependency-free.
 */

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  return dp
}

type DiffOp = { type: "same" | "add" | "del"; line: string }

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const dp = lcsMatrix(a, b)
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", line: a[i]! })
      i++
    } else {
      ops.push({ type: "add", line: b[j]! })
      j++
    }
  }
  while (i < a.length) ops.push({ type: "del", line: a[i++]! })
  while (j < b.length) ops.push({ type: "add", line: b[j++]! })
  return ops
}

/** Unified diff (unified format, 3 context lines) between two strings. */
export function unifiedDiff(before: string, after: string, fromFile = "before", toFile = "after"): string {
  if (before === after) return ""
  const a = before.split("\n")
  const b = after.split("\n")
  const ops = diffLines(a, b)

  // Group ops into hunks with 3 lines of context.
  const changed = ops.map((op) => op.type !== "same")
  const context = 3
  const keep = new Array<boolean>(ops.length).fill(false)
  for (let k = 0; k < ops.length; k++) {
    if (!changed[k]) continue
    for (let c = Math.max(0, k - context); c <= Math.min(ops.length - 1, k + context); c++) keep[c] = true
  }

  const hunks: string[] = []
  let aLine = 1
  let bLine = 1
  let k = 0
  while (k < ops.length) {
    if (!keep[k]) {
      if (ops[k]!.type === "same") {
        aLine++
        bLine++
      }
      k++
      continue
    }
    // Hunk start
    const startK = k
    let aStart = aLine
    let bStart = bLine
    const body: string[] = []
    while (k < ops.length && keep[k]) {
      const op = ops[k]!
      if (op.type === "same") {
        body.push(" " + op.line)
        aLine++
        bLine++
      } else if (op.type === "del") {
        body.push("-" + op.line)
        aLine++
      } else {
        body.push("+" + op.line)
        bLine++
      }
      k++
    }
    const aCount = ops
      .slice(startK, k)
      .filter((op) => op.type !== "add").length
    const bCount = ops
      .slice(startK, k)
      .filter((op) => op.type !== "del").length
    hunks.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@\n` + body.join("\n"))
  }

  return [`--- ${fromFile}`, `+++ ${toFile}`, ...hunks].join("\n") + "\n"
}
