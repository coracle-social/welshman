import {describe, it, expect, vi} from "vitest"
import {createSearch} from "../src/search"
import type {SearchOptions} from "../src/search"

describe("createSearch", () => {
  // Test data
  type TestItem = {
    id: string
    name: string
    description: string
  }

  const testItems: TestItem[] = [
    {id: "1", name: "Apple", description: "A fruit"},
    {id: "2", name: "Banana", description: "Yellow fruit"},
    {id: "3", name: "Orange", description: "Citrus fruit"},
  ]

  const baseOptions: SearchOptions<string, TestItem> = {
    getValue: item => item.id,
    fuseOptions: {
      keys: ["name", "description"],
    },
  }

  it("should create a search object with required methods", () => {
    const search = createSearch(testItems, baseOptions)

    expect(search).toHaveProperty("options")
    expect(search).toHaveProperty("getValue")
    expect(search).toHaveProperty("getOption")
    expect(search).toHaveProperty("searchOptions")
    expect(search).toHaveProperty("searchValues")
  })

  it("should return all items when search term is empty", () => {
    const search = createSearch(testItems, baseOptions)
    const results = search.searchOptions("")

    expect(results).toHaveLength(testItems.length)
    expect(results).toEqual(testItems)
  })

  it("should find items by name", () => {
    const search = createSearch(testItems, baseOptions)
    const results = search.searchOptions("Apple")

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("Apple")
  })

  it("should find items by description", () => {
    const search = createSearch(testItems, baseOptions)
    const results = search.searchOptions("Citrus")

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("Orange")
  })

  it("should return values using getValue function", () => {
    const search = createSearch(testItems, baseOptions)
    const results = search.searchValues("Apple")

    expect(results).toHaveLength(1)
    expect(results[0]).toBe("1") // The id of Apple
  })

  it("should get option by value", () => {
    const search = createSearch(testItems, baseOptions)
    const item = search.getOption("1")

    expect(item).toBeDefined()
    expect(item?.name).toBe("Apple")
  })

  it("should call onSearch callback when provided", () => {
    const onSearch = vi.fn()
    const search = createSearch(testItems, {...baseOptions, onSearch})

    search.searchOptions("test")
    expect(onSearch).toHaveBeenCalledWith("test")
  })

  it("should apply custom sort function when provided", () => {
    const sortFn = vi.fn()
    const items = [
      {id: "1", name: "test item", description: "exact match"},
      {id: "2", name: "testing", description: "partial match"},
      {id: "3", name: "other", description: "test somewhere"},
    ]

    const search = createSearch(items, {...baseOptions, sortFn})
    const results = search.searchOptions("test")
    // Results should be sorted by score
    expect(sortFn).toHaveBeenCalled()
  })

  it("should handle fuzzy matching", () => {
    const search = createSearch(testItems, baseOptions)
    const results = search.searchOptions("Aple") // Misspelled "Apple"

    expect(results.length).toBe(2)
    expect(results[0].name).toBe("Apple")
  })

  it("should respect fuseOptions threshold", () => {
    const search = createSearch(testItems, {
      ...baseOptions,
      fuseOptions: {
        ...baseOptions.fuseOptions,
        threshold: 0.1, // Very strict matching
      },
    })

    const results = search.searchOptions("Aple")
    expect(results).toHaveLength(0) // Should not match with strict threshold
  })
})
