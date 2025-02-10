import {hexToBech32, fromPairs} from "@welshman/lib"
import type {TrustedEvent} from "./Events.js"

const DIVISORS = {
  m: BigInt(1e3),
  u: BigInt(1e6),
  n: BigInt(1e9),
  p: BigInt(1e12),
}

const MAX_MILLISATS = BigInt("2100000000000000000")

const MILLISATS_PER_BTC = BigInt(1e11)

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

  if (address.startsWith("lnurl1")) {
    return address
  }

  // If it's a regular url, just encode it
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

  return null
}

export type Zapper = {
  lnurl: string
  pubkey?: string
  callback?: string
  minSendable?: number
  maxSendable?: number
  nostrPubkey?: string
  allowsNostr?: boolean
}

export type Zap = {
  request: TrustedEvent
  response: TrustedEvent
  invoiceAmount: number
}

export const zapFromEvent = (response: TrustedEvent, zapper: Zapper | undefined) => {
  const responseMeta = fromPairs(response.tags)

  let zap: Zap
  try {
    zap = {
      response,
      invoiceAmount: getInvoiceAmount(responseMeta.bolt11),
      request: JSON.parse(responseMeta.description),
    }
  } catch (e) {
    return null
  }

  // Don't count zaps that the user requested for himself
  if (zap.request.pubkey === zapper?.pubkey) {
    return null
  }

  const {amount, lnurl} = fromPairs(zap.request.tags)

  // Verify that the zapper actually sent the requested amount (if it was supplied)
  if (amount && parseInt(amount) !== zap.invoiceAmount) {
    return null
  }

  // If the recipient and the zapper are the same person, it's legit
  if (responseMeta.p === response.pubkey) {
    return zap
  }

  // If the sending client provided an lnurl tag, verify that too
  if (lnurl && lnurl !== zapper?.lnurl) {
    return null
  }

  // Verify that the request actually came from the recipient's zapper
  if (zap.response.pubkey !== zapper?.nostrPubkey) {
    return null
  }

  return zap
}
