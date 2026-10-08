import {describe, it, expect} from "vitest"
import {
  bolt12ProofPaysOffer,
  canonicalBolt12,
  decodeBolt12,
  decodeBolt12PayerProof,
  parseBolt12Tlvs,
} from "../src/Bolt12"

// The BOLT12 payer proof conformance suite, trimmed to what a reader is asked to check.
import vectors from "./bolt12-payer-proof-vectors.json"

const proofOf = (name: string) =>
  decodeBolt12PayerProof(vectors.valid.find((vector: any) => vector.name === name).proof)!

// An offer holding one offer_issuer_id, which the invoice behind every vector also carries.
const issuerOffer = "lno1zcssyj7z5vfx29flqlnsuzatppeyu6u9ugtl3ntz3n4k996zg7a5jvuz"

const otherIssuerOffer = "lno1zcssxfr986kyx3ygqqkvq6alklcslcvfj834l8lyxqkmafkjx57up2cu"

// The same issuer, plus an offer_description the payer did not disclose.
const describedOffer =
  "lno1pgyxzgrrdanxvet9zcssyj7z5vfx29flqlnsuzatppeyu6u9ugtl3ntz3n4k996zg7a5jvuz"

describe("Bolt12", () => {
  describe("canonicalBolt12", () => {
    it("lowercases and drops the separators", () => {
      expect(canonicalBolt12("LNO1QGSY+AB C")).toBe("lno1qgsyabc")
    })
  })

  describe("decodeBolt12", () => {
    it("reads bech32 characters with no checksum", () => {
      expect(decodeBolt12("lno1qgzyq", "lno")).toEqual(Uint8Array.from([0x02, 0x04, 0x40]))
    })

    it("refuses another prefix, a character off the charset, and stray padding", () => {
      expect(decodeBolt12("lni1qgzyq", "lno")).toBeUndefined()
      expect(decodeBolt12("lno1qgzyb", "lno")).toBeUndefined()
      expect(decodeBolt12("lno1qgzyp", "lno")).toBeUndefined()
    })

    it("refuses a whole character of padding", () => {
      expect(decodeBolt12("lno1qq", "lno")).toEqual(Uint8Array.from([0x00]))
      expect(decodeBolt12("lno1qqq", "lno")).toBeUndefined()
      expect(decodeBolt12("lno1q", "lno")).toBeUndefined()
    })
  })

  describe("parseBolt12Tlvs", () => {
    it("reads type, length and value", () => {
      const tlvs = parseBolt12Tlvs(Uint8Array.from([2, 1, 9, 253, 1, 0, 2, 7, 8]))!

      expect(tlvs.map(tlv => tlv.type)).toEqual([2, 256])
      expect(tlvs[1].value).toEqual(Uint8Array.from([7, 8]))
    })

    it("refuses types out of order, a truncated type, and a value running past the end", () => {
      expect(parseBolt12Tlvs(Uint8Array.from([2, 1, 9, 2, 1, 9]))).toBeUndefined()
      expect(parseBolt12Tlvs(Uint8Array.from([0xfd]))).toBeUndefined()
      expect(parseBolt12Tlvs(Uint8Array.from([2, 4, 9]))).toBeUndefined()
    })
  })

  describe("decodeBolt12PayerProof", () => {
    for (const vector of vectors.valid) {
      it(`accepts ${vector.name}`, () => {
        const proof = decodeBolt12PayerProof(vector.proof)

        expect(proof?.paymentHash).toBe(vector.paymentHash)
        expect(proof?.preimage).toBe(vector.preimage)
        expect(proof?.payerId).toBe(vector.payerId)
        expect(proof?.nodeId).toBe(vector.nodeId)
        expect(proof?.amount).toBe(vector.amount ?? undefined)
      })
    }

    for (const vector of vectors.invalid) {
      it(`refuses ${vector.reason}`, () => {
        expect(decodeBolt12PayerProof(vector.proof)).toBeUndefined()
      })
    }

    it("refuses a proof with a character changed or dropped", () => {
      const {proof} = vectors.valid[0]
      const middle = Math.floor(proof.length / 2)

      expect(
        decodeBolt12PayerProof(
          proof.slice(0, middle) + (proof[middle] === "q" ? "p" : "q") + proof.slice(middle + 1),
        ),
      ).toBeUndefined()

      expect(
        decodeBolt12PayerProof(proof.slice(0, middle) + proof.slice(middle + 1)),
      ).toBeUndefined()
    })
  })

  describe("bolt12ProofPaysOffer", () => {
    it("takes an offer whose every field the proof repeats", () => {
      expect(bolt12ProofPaysOffer(proofOf("full_disclosure"), issuerOffer)).toBe(true)
    })

    it("refuses another issuer, a field the proof withheld, and a proof of nothing", () => {
      expect(bolt12ProofPaysOffer(proofOf("full_disclosure"), otherIssuerOffer)).toBe(false)
      expect(bolt12ProofPaysOffer(proofOf("full_disclosure"), describedOffer)).toBe(false)
      expect(bolt12ProofPaysOffer(proofOf("minimal_disclosure"), issuerOffer)).toBe(false)
    })
  })
})
