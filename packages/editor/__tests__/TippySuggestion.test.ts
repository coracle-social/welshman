import {describe, it, expect} from "vitest"
import {DefaultSuggestionsWrapper} from "../src/plugins/TippySuggestion.js"

const ITEMS = ["alice", "alicia"]

const makeWrapper = (term: string, allowCreate = false) => {
  const selected: string[] = []

  const wrapper = new DefaultSuggestionsWrapper(document.createElement("div"), {
    term,
    allowCreate,
    select: (value: string) => {
      selected.push(value)
    },
    search: (query: string) => ITEMS.filter(item => item.startsWith(query)),
    createSuggestion: (item: string) => {
      const span = document.createElement("span")

      span.textContent = item

      return span
    },
  })

  return {wrapper, selected}
}

describe("DefaultSuggestionsWrapper", () => {
  it("selects the highlighted item on space", () => {
    const {wrapper, selected} = makeWrapper("ali")

    expect(wrapper.onKeyDown({code: "Space"})).toBe(true)
    expect(selected).toEqual(["alice"])
  })

  it("selects the arrowed-to item on space", () => {
    const {wrapper, selected} = makeWrapper("ali")

    wrapper.onKeyDown({code: "ArrowDown"})

    expect(wrapper.onKeyDown({code: "Space"})).toBe(true)
    expect(selected).toEqual(["alicia"])
  })

  it("types a space through when the term is empty", () => {
    const {wrapper, selected} = makeWrapper("")

    expect(wrapper.onKeyDown({code: "Space"})).toBe(false)
    expect(selected).toEqual([])
  })

  it("types a space through when nothing matches", () => {
    const {wrapper, selected} = makeWrapper("zeb")

    expect(wrapper.onKeyDown({code: "Space"})).toBe(false)
    expect(selected).toEqual([])
  })

  it("creates the term on space when creation is allowed", () => {
    const {wrapper, selected} = makeWrapper("ali", true)

    expect(wrapper.onKeyDown({code: "Space"})).toBe(true)
    expect(selected).toEqual(["ali"])
  })

  it("selects the highlighted item on enter and tab", () => {
    for (const code of ["Enter", "Tab"]) {
      const {wrapper, selected} = makeWrapper("ali")

      expect(wrapper.onKeyDown({code})).toBe(true)
      expect(selected).toEqual(["alice"])
    }
  })
})
