import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {ctx, fetchJson, bech32ToHex, hexToBech32, tryCatch, postJson} from "@welshman/lib"
import {fetchZappers} from "../src/zappers.ts"

// Mock dependencies
vi.mock("@welshman/lib", async imports => {
  return {
    ...(await imports()),
    ctx: {
      app: {
        dufflepudUrl: undefined, // Will be modified in tests
      },
    },
    identity: x => x,
    fetchJson: vi.fn(),
    bech32ToHex: vi.fn(),
    hexToBech32: vi.fn(),
    tryCatch: vi.fn(fn => {
      try {
        return fn()
      } catch (e) {
        return undefined
      }
    }),
    postJson: vi.fn(),
  }
})

describe("fetchZappers", () => {
  const mockLnurls = [
    "lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0d3h82unvwqhkxctvd46820w0fjx",
    "lnurl2wd68gurn8ghj7ur5v9kxjerrv9kzum5v93kket39ehx7mmwp5hxsmwda8hx",
  ]

  const mockHexLnurls = ["41414141414141", "42424242424242"]

  const mockZapperInfo1 = {
    callback: "https://zapper1.com/callback",
    minSendable: 1000,
    maxSendable: 100000000,
    metadata: JSON.stringify([["text/plain", "Zapper One"]]),
  }

  const mockZapperInfo2 = {
    callback: "https://zapper2.com/callback",
    minSendable: 2000,
    maxSendable: 200000000,
    metadata: JSON.stringify([["text/plain", "Zapper Two"]]),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default bech32ToHex mockup with 1:1 mapping to hexes
    vi.mocked(bech32ToHex).mockImplementation(lnurl => {
      if (lnurl === mockLnurls[0]) return mockHexLnurls[0]
      if (lnurl === mockLnurls[1]) return mockHexLnurls[1]
      throw new Error("Invalid lnurl")
    })

    // Default hexToBech32 mockup with inverse mapping
    vi.mocked(hexToBech32).mockImplementation((prefix, hex) => {
      if (hex === mockHexLnurls[0]) return mockLnurls[0]
      if (hex === mockHexLnurls[1]) return mockLnurls[1]
      throw new Error("Invalid hex")
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it("should fetch zappers using dufflepud when URL is provided", async () => {
    // Arrange
    const dufflepudUrl = "https://dufflepud.com"
    ctx.app.dufflepudUrl = dufflepudUrl

    vi.mocked(postJson).mockResolvedValue({
      data: [
        {lnurl: mockHexLnurls[0], info: mockZapperInfo1},
        {lnurl: mockHexLnurls[1], info: mockZapperInfo2},
      ],
    })

    // Act
    const result = await fetchZappers(mockLnurls)

    // Assert
    expect(postJson).toHaveBeenCalledWith(`${dufflepudUrl}/zapper/info`, {lnurls: mockHexLnurls})

    expect(bech32ToHex).toHaveBeenCalledTimes(2)
    expect(hexToBech32).toHaveBeenCalledTimes(2)

    expect(result.size).toBe(2)
    expect(result.get(mockLnurls[0])).toEqual(mockZapperInfo1)
    expect(result.get(mockLnurls[1])).toEqual(mockZapperInfo2)
  })

  it("should fetch zappers directly when dufflepud URL is not provided", async () => {
    // Arrange
    ctx.app.dufflepudUrl = undefined

    vi.mocked(fetchJson).mockImplementation(async url => {
      if (url === mockHexLnurls[0]) return mockZapperInfo1
      if (url === mockHexLnurls[1]) return mockZapperInfo2
      throw new Error("Invalid URL")
    })

    // Act
    const result = await fetchZappers(mockLnurls)

    // Assert
    expect(fetchJson).toHaveBeenCalledWith(mockHexLnurls[0])
    expect(fetchJson).toHaveBeenCalledWith(mockHexLnurls[1])
    expect(postJson).not.toHaveBeenCalled()

    expect(result.size).toBe(2)
    expect(result.get(mockLnurls[0])).toEqual(mockZapperInfo1)
    expect(result.get(mockLnurls[1])).toEqual(mockZapperInfo2)
  })

  it("should handle invalid lnurls when using dufflepud", async () => {
    // Arrange
    ctx.app.dufflepudUrl = "https://dufflepud.com"

    // Make only the first lnurl valid
    vi.mocked(bech32ToHex).mockImplementation(lnurl => {
      if (lnurl === mockLnurls[0]) return mockHexLnurls[0]
      throw new Error("Invalid lnurl")
    })

    vi.mocked(postJson).mockResolvedValue({
      data: [{lnurl: mockHexLnurls[0], info: mockZapperInfo1}],
    })

    // Act
    const result = await fetchZappers(mockLnurls)

    // Assert
    expect(postJson).toHaveBeenCalledWith(`${ctx.app.dufflepudUrl}/zapper/info`, {
      lnurls: [mockHexLnurls[0]],
    })

    expect(result.size).toBe(1)
    expect(result.get(mockLnurls[0])).toEqual(mockZapperInfo1)
    expect(result.get(mockLnurls[1])).toBeUndefined()
  })

  it("should handle invalid lnurls when fetching directly", async () => {
    // Arrange
    ctx.app.dufflepudUrl = undefined

    // Make only the first lnurl valid
    vi.mocked(bech32ToHex).mockImplementation(lnurl => {
      if (lnurl === mockLnurls[0]) return mockHexLnurls[0]
      throw new Error("Invalid lnurl")
    })

    vi.mocked(fetchJson).mockImplementation(async url => {
      if (url === mockHexLnurls[0]) return mockZapperInfo1
      throw new Error("Invalid URL")
    })

    // Act
    const result = await fetchZappers(mockLnurls)

    // Assert
    expect(fetchJson).toHaveBeenCalledWith(mockHexLnurls[0])
    expect(fetchJson).toHaveBeenCalledTimes(1)

    expect(result.size).toBe(1)
    expect(result.get(mockLnurls[0])).toEqual(mockZapperInfo1)
    expect(result.get(mockLnurls[1])).toBeUndefined()
  })

  it("should handle empty lnurl list", async () => {
    // Arrange
    ctx.app.dufflepudUrl = "https://dufflepud.com"

    // Act
    const result = await fetchZappers([])

    // Assert
    expect(postJson).not.toHaveBeenCalled()
    expect(fetchJson).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it("should handle malformed zapper responses", async () => {
    // Arrange
    ctx.app.dufflepudUrl = "https://dufflepud.com"

    vi.mocked(postJson).mockResolvedValue({
      // Missing data field
      wrong_field: [],
    })

    // Act
    const result = await fetchZappers(mockLnurls)

    // Assert
    expect(postJson).toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it("should handle hexToBech32 errors when processing dufflepud response", async () => {
    // Arrange
    ctx.app.dufflepudUrl = "https://dufflepud.com"

    vi.mocked(hexToBech32).mockImplementation(() => {
      throw new Error("Invalid hex")
    })

    vi.mocked(postJson).mockResolvedValue({
      data: [
        {lnurl: mockHexLnurls[0], info: mockZapperInfo1},
        {lnurl: mockHexLnurls[1], info: mockZapperInfo2},
      ],
    })

    // Act
    const result = await fetchZappers(mockLnurls)

    // Assert
    expect(postJson).toHaveBeenCalled()
    expect(hexToBech32).toHaveBeenCalled()
    expect(result.size).toBe(0)
  })
})
