import {describe, it, expect} from "vitest"
import {normalizeWikiName, isNormalizedWikiName} from "../src/Wiki"

describe("normalizeWikiName", () => {
  // The examples given in NIP-54.
  it("normalizes the examples from the spec", () => {
    expect(normalizeWikiName("Wiki Article")).toBe("wiki-article")
    expect(normalizeWikiName("What's Up?")).toBe("whats-up")
    expect(normalizeWikiName("  Hello  World  ")).toBe("hello-world")
    expect(normalizeWikiName("Article 1")).toBe("article-1")
    expect(normalizeWikiName("ウィキペディア")).toBe("ウィキペディア")
    expect(normalizeWikiName("Ñoño")).toBe("ñoño")
    expect(normalizeWikiName("Москва")).toBe("москва")
    expect(normalizeWikiName("日本語 Article")).toBe("日本語-article")
  })

  it("collapses and trims hyphens", () => {
    expect(normalizeWikiName("--proof--of--work--")).toBe("proof-of-work")
    expect(normalizeWikiName("? ? ?")).toBe("")
  })

  it("keeps a decomposed letter's accent", () => {
    expect(normalizeWikiName("Ñ".normalize("NFD"))).toBe("ñ".normalize("NFD"))
  })

  it("is idempotent", () => {
    for (const name of ["Wiki Article", "What's Up?", "日本語 Article", "--a--"]) {
      expect(normalizeWikiName(normalizeWikiName(name))).toBe(normalizeWikiName(name))
      expect(isNormalizedWikiName(normalizeWikiName(name))).toBe(true)
    }
  })

  it("recognizes names that aren't normalized", () => {
    expect(isNormalizedWikiName("bitcoin")).toBe(true)
    expect(isNormalizedWikiName("Bitcoin")).toBe(false)
    expect(isNormalizedWikiName("proof of work")).toBe(false)
  })
})
