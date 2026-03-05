import {describe, it, expect, vi} from "vitest"
import {sampleBeta} from "../src/Beta"

describe("Beta", () => {
  describe("sampleBeta", () => {
    it("should return values in [0, 1] for uniform prior", () => {
      for (let i = 0; i < 100; i++) {
        const value = sampleBeta(1, 1)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    })

    it("should concentrate near 1 for strong success prior", () => {
      const samples = Array.from({length: 1000}, () => sampleBeta(100, 1))
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      expect(mean).toBeGreaterThan(0.95)
    })

    it("should concentrate near 0 for strong failure prior", () => {
      const samples = Array.from({length: 1000}, () => sampleBeta(1, 100))
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      expect(mean).toBeLessThan(0.05)
    })

    it("should produce mean ≈ alpha / (alpha + beta)", () => {
      const alpha = 3
      const beta = 7
      const expected = alpha / (alpha + beta) // 0.3
      const samples = Array.from({length: 10000}, () => sampleBeta(alpha, beta))
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      expect(Math.abs(mean - expected)).toBeLessThan(0.05)
    })

    it("should handle very small alpha/beta without crashing", () => {
      for (let i = 0; i < 100; i++) {
        const value = sampleBeta(0.1, 0.1)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    })

    it("should throw on zero, negative, NaN, and Infinity params", () => {
      expect(() => sampleBeta(0, 1)).toThrow(RangeError)
      expect(() => sampleBeta(1, 0)).toThrow(RangeError)
      expect(() => sampleBeta(-1, 1)).toThrow(RangeError)
      expect(() => sampleBeta(1, -1)).toThrow(RangeError)
      expect(() => sampleBeta(NaN, 1)).toThrow(RangeError)
      expect(() => sampleBeta(1, NaN)).toThrow(RangeError)
      expect(() => sampleBeta(Infinity, 1)).toThrow(RangeError)
      expect(() => sampleBeta(1, Infinity)).toThrow(RangeError)
    })

    it("should produce deterministic results with seeded RNG", () => {
      let seed = 42
      const seededRng = () => {
        seed = (seed * 16807 + 0) % 2147483647
        return seed / 2147483647
      }

      seed = 42
      const a = sampleBeta(2, 5, seededRng)

      seed = 42
      const b = sampleBeta(2, 5, seededRng)

      expect(a).toBe(b)
    })

    it("should return rng() directly for uniform prior (fast path)", () => {
      const rng = vi.fn(() => 0.42)
      const result = sampleBeta(1, 1, rng)
      expect(result).toBe(0.42)
      expect(rng).toHaveBeenCalledTimes(1)
    })
  })
})
