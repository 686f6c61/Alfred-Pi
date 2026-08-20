import { test, expect } from "bun:test"
import { unifiedDiff } from "../lib/diff.ts"

test("identical content produces no diff", () => {
  expect(unifiedDiff("a\nb\n", "a\nb\n")).toBe("")
})

test("changed line appears as -old +new with hunk header", () => {
  const d = unifiedDiff("one\ntwo\nthree\n", "one\nTWO\nthree\n", "a.json", "a.json")
  expect(d).toContain("-two")
  expect(d).toContain("+TWO")
  expect(d).toContain("@@")
  expect(d).toContain("--- a.json")
})

test("added lines only", () => {
  const d = unifiedDiff("a\n", "a\nb\n")
  expect(d).toContain("+b")
  expect(d).not.toContain("-b")
})

test("removed lines only", () => {
  const d = unifiedDiff("a\nb\n", "a\n")
  expect(d).toContain("-b")
  expect(d).not.toContain("+b")
})
