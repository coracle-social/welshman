import {describe, it, expect, vi} from "vitest"
import {sampleBeta} from "../src/Beta"

// Mirrors the decay logic from @welshman/app relayStats.ts for integration testing
const HOUR = 3600
const THOMPSON_DECAY = 0.95
const THOMPSON_DECAY_INTERVAL = HOUR

function decayPrior(alpha: number, beta: number, elapsedSeconds: number) {
  const intervals = elapsedSeconds / THOMPSON_DECAY_INTERVAL
  const decay = Math.pow(THOMPSON_DECAY, intervals)
  return {
    alpha: 1 + (alpha - 1) * decay,
    beta: 1 + (beta - 1) * decay,
  }
}

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

  describe("Thompson Sampling decay integration", () => {
    it("should decay priors toward uniform after long idle", () => {
      const storedAlpha = 100
      const storedBeta = 5
      const oneWeek = 7 * 24 * HOUR

      const {alpha, beta} = decayPrior(storedAlpha, storedBeta, oneWeek)
      // After a week of decay at 0.95/hour (0.95^168 ≈ 0.00018), priors near uniform
      expect(alpha).toBeLessThan(1.02)
      expect(beta).toBeLessThan(1.01)
    })

    it("should preserve priors with zero elapsed time", () => {
      const {alpha, beta} = decayPrior(50, 10, 0)
      expect(alpha).toBe(50)
      expect(beta).toBe(10)
    })

    it("decay-then-update should not restore stale confidence", () => {
      // Simulate: relay had alpha=100, idle for a week, then one new success
      const storedAlpha = 100
      const storedBeta = 5
      const oneWeek = 7 * 24 * HOUR

      // Correct behavior: decay first, then add observation
      const decayed = decayPrior(storedAlpha, storedBeta, oneWeek)
      const updatedAlpha = decayed.alpha + 1 // one success

      // Updated alpha should be near 2 (decayed ~1 + 1 success), NOT near 101
      expect(updatedAlpha).toBeLessThan(3)
      expect(updatedAlpha).toBeGreaterThan(1)
      // Beta should also remain near-uniform after decay
      expect(decayed.beta).toBeLessThan(1.01)
    })

    it("decayed priors should produce valid sampleBeta input", () => {
      // Even heavily decayed, alpha/beta stay >= 1
      const {alpha, beta} = decayPrior(1000, 1000, 100 * 24 * HOUR)
      expect(alpha).toBeGreaterThanOrEqual(1)
      expect(beta).toBeGreaterThanOrEqual(1)

      // Should not throw
      const sample = sampleBeta(alpha, beta)
      expect(sample).toBeGreaterThanOrEqual(0)
      expect(sample).toBeLessThanOrEqual(1)
    })
  })

  describe("router defensive fallback contract", () => {
    it("sampleBeta should throw on invalid params so router can catch", () => {
      // Router wraps sampleBeta in try/catch — verify the throw contract
      expect(() => sampleBeta(-1, 2)).toThrow(RangeError)
      expect(() => sampleBeta(2, -1)).toThrow(RangeError)
      expect(() => sampleBeta(0, 0)).toThrow(RangeError)
      expect(() => sampleBeta(NaN, NaN)).toThrow(RangeError)
    })

    it("router scoring pattern should fall back on bad priors", () => {
      // Simulates the exact pattern in router's scoreRelay
      const badPrior = {alpha: -1, beta: 2}
      let sample: number
      try {
        sample = sampleBeta(badPrior.alpha, badPrior.beta)
      } catch {
        sample = Math.random()
      }
      expect(sample).toBeGreaterThanOrEqual(0)
      expect(sample).toBeLessThanOrEqual(1)
    })
  })
})
