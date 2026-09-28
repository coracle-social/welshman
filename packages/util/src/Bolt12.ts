import {schnorr} from "@noble/curves/secp256k1.js"
import {
  asciiToBytes,
  bytesToHex,
  bytesToNumberBE,
  concatBytes,
  equalBytes,
} from "@noble/curves/utils.js"
import {sha256} from "@noble/hashes/sha2.js"
import {tryCatch} from "@welshman/lib"

export type Bolt12Tlv = {
  type: number
  typeBytes: Uint8Array
  value: Uint8Array
  bytes: Uint8Array
}

const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

const utf8Decoder = new TextDecoder("utf-8", {fatal: true})

// A canonical bolt12 string is lowercase with the separators and whitespace removed.
export const canonicalBolt12 = (encoded: string) => encoded.toLowerCase().replace(/[+\s]/g, "")

// Bolt12 uses bech32 characters with no checksum and no length limit.
export const decodeBolt12 = (encoded: string, prefix: string) => {
  const data = canonicalBolt12(encoded).split(prefix + "1")
  let bytes: Uint8Array | undefined

  if (data.length === 2 && data[0] === "" && data[1].length > 0) {
    const decoded: number[] = []
    let acc = 0
    let bits = 0
    let valid = true

    for (const char of data[1]) {
      const word = charset.indexOf(char)

      if (word < 0) {
        valid = false
        break
      }

      acc = ((acc << 5) | word) & 0xfff
      bits += 5

      if (bits >= 8) {
        bits -= 8
        decoded.push((acc >> bits) & 0xff)
      }
    }

    // Whatever is left over pads the last character out and has to be zero.
    if (valid && (acc & ((1 << bits) - 1)) === 0) {
      bytes = Uint8Array.from(decoded)
    }
  }

  return bytes
}

const readBigsize = (bytes: Uint8Array, offset: number) => {
  const first = bytes[offset]
  const size = first < 0xfd ? 0 : first === 0xfd ? 2 : first === 0xfe ? 4 : 8
  const minimum = size === 0 ? 0 : size === 2 ? 0xfd : size === 4 ? 0x10000 : 0x100000000
  const end = offset + 1 + size
  let result: {value: number; next: number} | undefined

  if (offset < bytes.length && end <= bytes.length) {
    const value = size === 0 ? first : Number(bytesToNumberBE(bytes.subarray(offset + 1, end)))

    if (value >= minimum && Number.isSafeInteger(value)) {
      result = {value, next: end}
    }
  }

  return result
}

// Tlv types ascend and no field may run past the end of the stream.
export const parseBolt12Tlvs = (bytes: Uint8Array) => {
  const tlvs: Bolt12Tlv[] = []
  let offset = 0
  let valid = true

  while (valid && offset < bytes.length) {
    const type = readBigsize(bytes, offset)
    const length = type && readBigsize(bytes, type.next)
    const end = length ? length.next + length.value : 0
    const previous = tlvs[tlvs.length - 1]

    if (type && length && end <= bytes.length && (!previous || type.value > previous.type)) {
      tlvs.push({
        type: type.value,
        typeBytes: bytes.subarray(offset, type.next),
        value: bytes.subarray(length.next, end),
        bytes: bytes.subarray(offset, end),
      })

      offset = end
    } else {
      valid = false
    }
  }

  return valid ? tlvs : undefined
}

const leafTag = asciiToBytes("LnLeaf")

const nonceTag = asciiToBytes("LnNonce")

const branchTag = asciiToBytes("LnBranch")

// Bip340 tagged hash, as bolt12 signature calculation defines it.
const taggedHash = (tag: Uint8Array, message: Uint8Array) => {
  const hashedTag = sha256(tag)

  return sha256(concatBytes(hashedTag, hashedTag, message))
}

const lesserFirst = (a: Uint8Array, b: Uint8Array) => {
  let order = 0

  for (let i = 0; order === 0 && i < a.length; i++) {
    order = a[i] - b[i]
  }

  return order <= 0 ? concatBytes(a, b) : concatBytes(b, a)
}

// Branch ordering is by hash, so a proof never has to say which side it came from.
const branchHash = (a: Uint8Array, b: Uint8Array) => taggedHash(branchTag, lesserFirst(a, b))

const leafHash = (tlv: Bolt12Tlv, nonce: Uint8Array) =>
  branchHash(taggedHash(leafTag, tlv.bytes), nonce)

/**
 * Merkle root over leaf hashes, where an undefined leaf is one the payer withheld. A node
 * with one branch entirely withheld takes that branch from `missing`, in the post-order the
 * writer appended them; the tree leans left, so the split is the largest power of two below
 * the leaf count. Throws when `missing` runs out.
 */
const merkleRoot = (nodes: (Uint8Array | undefined)[], missing: Uint8Array[]) => {
  let root = nodes[0]

  if (nodes.length > 1) {
    let split = 1

    while (split * 2 < nodes.length) {
      split *= 2
    }

    const left = merkleRoot(nodes.slice(0, split), missing)
    const right = merkleRoot(nodes.slice(split), missing)

    if (left && right) {
      root = branchHash(left, right)
    } else if (left || right) {
      const hash = missing.shift()

      if (!hash) {
        throw new Error("Bolt12 payer proof is missing a merkle branch")
      }

      root = branchHash(left || hash, right || hash)
    } else {
      root = undefined
    }
  }

  return root
}

type Fields = Map<number, Uint8Array>

// The tag names the stream and the field the signature sits in, per bolt12 signature calculation.
const verifySignature = (
  root: Uint8Array,
  tag: string,
  signature: Uint8Array | undefined,
  pubkey: Uint8Array | undefined,
) =>
  Boolean(
    signature &&
      pubkey?.length === 33 &&
      tryCatch(() =>
        schnorr.verify(signature, taggedHash(asciiToBytes(tag), root), pubkey.subarray(1)),
      ),
  )

export type Bolt12PayerProof = {
  fields: Fields
  paymentHash: string
  preimage: string
  payerId: string
  nodeId: string
  payerNote?: string
  amount?: number
}

// Fields the invoice contributed, which is everything outside the signature and proof ranges.
const isInvoiceField = (type: number) =>
  (type >= 1 && type <= 239) || (type >= 1000000000 && type <= 3999999999)

const isSignatureField = (type: number) => type >= 240 && type <= 1000

const splitHashes = (bytes: Uint8Array | undefined) => {
  const hashes: Uint8Array[] = []

  for (let i = 0; bytes && i < bytes.length; i += 32) {
    hashes.push(bytes.subarray(i, i + 32))
  }

  return bytes && bytes.length % 32 === 0 ? hashes : undefined
}

const readMarkers = (bytes: Uint8Array | undefined) => {
  const markers: number[] = []
  let offset = 0

  while (bytes && offset < bytes.length) {
    const marker = readBigsize(bytes, offset)

    if (!marker) {
      return undefined
    }

    markers.push(marker.value)
    offset = marker.next
  }

  return markers
}

/**
 * Each marker stands in for a withheld field, renumbered to the smallest value that keeps the
 * invoice order. So one is either the number after an included field, the number after the
 * previous marker, one for the first marker, or the start of the high range after 239.
 */
const markersAreWellFormed = (markers: number[], included: Set<number>) =>
  markers.every((marker, i) => {
    const previous = i === 0 ? 0 : markers[i - 1]

    return (
      marker > previous &&
      isInvoiceField(marker) &&
      !included.has(marker) &&
      (included.has(marker - 1) ||
        marker === previous + 1 ||
        (previous === 239 && marker === 1000000000))
    )
  })

/**
 * Decodes a bolt12 `lnp` payer proof and runs every check the spec asks of a reader: the
 * preimage hashes to the payment hash, the withheld fields are renumbered in order, and both
 * signatures verify — the recipient node over the reconstructed invoice merkle root, and the
 * payer over the proof itself. Returns undefined for anything that fails.
 */
export const decodeBolt12PayerProof = (proof: string) =>
  tryCatch(() => {
    const bytes = decodeBolt12(proof, "lnp")
    const tlvs = bytes && parseBolt12Tlvs(bytes)
    let result: Bolt12PayerProof | undefined

    if (tlvs?.length) {
      const fields: Fields = new Map(tlvs.map(tlv => [tlv.type, tlv.value]))
      const preimage = fields.get(1001)
      const paymentHash = fields.get(168)
      const leafHashes = splitHashes(fields.get(1004))
      const missing = splitHashes(fields.get(1003))
      const markers = readMarkers(fields.get(1002))
      const included = tlvs.filter(tlv => isInvoiceField(tlv.type))
      const includedTypes = new Set(included.map(tlv => tlv.type))

      const wellFormed =
        !fields.has(0) &&
        fields.has(88) &&
        fields.has(176) &&
        fields.has(240) &&
        fields.has(241) &&
        preimage?.length === 32 &&
        paymentHash?.length === 32 &&
        leafHashes?.length === included.length &&
        Boolean(missing) &&
        Boolean(markers) &&
        markersAreWellFormed(markers!, includedTypes) &&
        equalBytes(sha256(preimage!), paymentHash!)

      if (wellFormed) {
        // Invreq_metadata is never disclosed, so the invoice tree always starts withheld.
        const invoice = [
          {type: 0, node: undefined as Uint8Array | undefined},
          ...included.map((tlv, i) => ({type: tlv.type, node: leafHash(tlv, leafHashes![i])})),
          ...markers!.map(type => ({type, node: undefined})),
        ].sort((a, b) => a.type - b.type)

        const remaining = [...missing!]
        const invoiceRoot = merkleRoot(
          invoice.map(({node}) => node),
          remaining,
        )

        const proofNodes = tlvs
          .filter(tlv => !isSignatureField(tlv.type))
          .map(tlv =>
            leafHash(tlv, taggedHash(concatBytes(nonceTag, tlvs[0].bytes), tlv.typeBytes)),
          )

        const proofRoot = merkleRoot(proofNodes, [])

        if (
          invoiceRoot &&
          proofRoot &&
          remaining.length === 0 &&
          verifySignature(
            invoiceRoot,
            "lightninginvoicesignature",
            fields.get(240),
            fields.get(176),
          ) &&
          verifySignature(
            proofRoot,
            "lightningpayer_proofproof_signature",
            fields.get(241),
            fields.get(88),
          )
        ) {
          const note = fields.get(89)
          const amount = fields.get(170)

          result = {
            fields,
            paymentHash: bytesToHex(paymentHash!),
            preimage: bytesToHex(preimage!),
            payerId: bytesToHex(fields.get(88)!),
            nodeId: bytesToHex(fields.get(176)!),
            payerNote: note && utf8Decoder.decode(note),
            amount: amount && Number(bytesToNumberBE(amount)),
          }
        }
      }
    }

    return result
  })

// Every field of the offer has to be in the proof unchanged for the proof to be of paying it.
export const bolt12ProofPaysOffer = (proof: Bolt12PayerProof, offer: string) => {
  const bytes = decodeBolt12(offer, "lno")
  const tlvs = bytes && parseBolt12Tlvs(bytes)

  return Boolean(
    tlvs?.length &&
      tlvs.every(tlv => {
        const value = proof.fields.get(tlv.type)

        return value && equalBytes(value, tlv.value)
      }),
  )
}
