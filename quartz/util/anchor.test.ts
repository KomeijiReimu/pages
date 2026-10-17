import test from "node:test"
import assert from "node:assert/strict"
import {
  parseLinkAnchor,
  serializeAnchor,
  splitAnchor,
  transformInternalLink,
  transformLink,
} from "./path"
import type { FullSlug, TransformOptions } from "./path"

test("typed anchors distinguish raw block IDs, headings and PDF fragments", () => {
  assert.deepEqual(parseLinkAnchor("note#%5EAb-C_d"), ["note", { kind: "block", id: "Ab-C_d" }])
  assert.deepEqual(parseLinkAnchor("note#Heading%20Text"), [
    "note",
    { kind: "heading", id: "heading-text" },
  ])
  assert.deepEqual(parseLinkAnchor("file.pdf#page=2&zoom=100"), [
    "file.pdf",
    { kind: "pdf", id: "page=2&zoom=100" },
  ])
  assert.deepEqual(splitAnchor("note#^AbC"), ["note", "#^AbC"])
  assert.equal(serializeAnchor({ kind: "block", id: "AbC" }), "#AbC")
  assert.equal(serializeAnchor({ kind: "block", id: "AbC" }, "internal"), "#^AbC")
  assert.equal(parseLinkAnchor("note#^非ASCII")[1]?.kind, "heading")
})

test("link strategies preserve block case without repeated fragment encoding", () => {
  for (const strategy of ["relative", "absolute", "shortest"] as const) {
    const opts: TransformOptions = { strategy, allSlugs: ["note"] as FullSlug[] }
    assert.equal(transformLink("source" as FullSlug, "note#%5EAb-C_d", opts), "./note#Ab-C_d")
    assert.equal(transformLink("source" as FullSlug, "note#中文%20标题", opts), "./note#中文-标题")
    assert.equal(transformLink("source" as FullSlug, "file.pdf#page=2", opts), "./file.pdf#page=2")
  }
  assert.equal(transformInternalLink("note#^AbC"), "./note#AbC")
  assert.equal(transformInternalLink("note%20name#Head%20Title"), "./note-name#head-title")
  assert.equal(transformInternalLink("note%20name#%5EAb%2DC_d"), "./note-name#Ab-C_d")
  assert.doesNotThrow(() => parseLinkAnchor("note#broken%escape"))
})
