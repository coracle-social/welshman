import {bytesToHex, hexToBech32} from "@welshman/lib"

const DIVISORS = {
  m: BigInt(1e3),
  u: BigInt(1e6),
  n: BigInt(1e9),
  p: BigInt(1e12),
}

const MAX_MILLISATS = BigInt("2100000000000000000")

const MILLISATS_PER_BTC = BigInt(1e11)

export const toMsats = (sats: number) => sats * 1000

export const fromMsats = (msats: number) => Math.floor(msats / 1000)

export const hrpToMillisat = (hrpString: string) => {
  let divisor, value
  if (hrpString.slice(-1).match(/^[munp]$/)) {
    divisor = hrpString.slice(-1)
    value = hrpString.slice(0, -1)
  } else if (hrpString.slice(-1).match(/^[^munp0-9]$/)) {
    throw new Error("Not a valid multiplier for the amount")
  } else {
    value = hrpString
  }

  if (!value.match(/^\d+$/)) throw new Error("Not a valid human readable amount")

  const valueBN = BigInt(value)

  const millisatoshisBN = divisor
    ? (valueBN * MILLISATS_PER_BTC) / (DIVISORS as any)[divisor]
    : valueBN * MILLISATS_PER_BTC

  if (
    (divisor === "p" && !(valueBN % BigInt(10) === BigInt(0))) ||
    millisatoshisBN > MAX_MILLISATS
  ) {
    throw new Error("Amount is outside of valid range")
  }

  return millisatoshisBN
}

export const getInvoiceAmount = (bolt11: string) => {
  const hrp = bolt11.match(/lnbc(\d+\w)/)
  const bn = hrpToMillisat(hrp![1])
  return Number(bn)
}

export const getLnUrl = (address: string) => {
  address = address.toLowerCase()

  // If it's already a lud06 we're good
  if (address.startsWith("lnurl1")) {
    return address
  }

  // If it's a regular url, encode it
  if (address.includes("://")) {
    return hexToBech32("lnurl", address)
  }

  // Try to parse it as a lud16 address
  if (address.includes("@")) {
    const [name, domain] = address.split("@")

    if (domain && name) {
      return hexToBech32("lnurl", `https://${domain}/.well-known/lnurlp/${name}`)
    }
  }
}

// A canonical raw offer is lowercase with BOLT12 separators and whitespace removed.
export const canonicalBolt12Offer = (offer: string) => offer.toLowerCase().replace(/[+\s]/g, "")

export const isBolt12Offer = (offer: string) => /^lno1[a-z0-9]+$/.test(canonicalBolt12Offer(offer))

export const isBolt12PayerProof = (proof: string) => /^lnp1[a-z0-9]+$/.test(proof.toLowerCase())

// NIP-B1 asks for at least 128 bits of entropy, lowercase hex.
export const isBolt12ZapId = (zapId: string) => /^([0-9a-f]{2}){16,}$/.test(zapId)

// parseInt on its own reads "21000.9" as 21000, which is not what the payer signed for.
export const isMsats = (amount: string) => /^\d+$/.test(amount)

export const makeBolt12ZapId = () => bytesToHex(crypto.getRandomValues(new Uint8Array(16)))

// NIP-B1 asks the payer proof's invreq_payer_note to carry the zap intent's id.
export const makeBolt12PayerNote = (zapIntentId: string) => `nostr:nipB1:${zapIntentId}`
