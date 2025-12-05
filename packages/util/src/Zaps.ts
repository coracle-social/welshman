import {now, tryCatch, fetchJson, hexToBech32, fromPairs} from "@welshman/lib"
import {ZAP_RESPONSE, ZAP_REQUEST} from "./Kinds.js"
import {getTagValue} from "./Tags.js"
import type {Filter} from "./Filters.js"
import type {TrustedEvent, SignedEvent} from "./Events.js"
import {makeEvent} from "./Events.js"

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
    return undefined
  }

  // Don't count zaps that the user requested for himself
  if (zap.request.pubkey === zapper?.pubkey) {
    return undefined
  }

  const {amount, lnurl} = fromPairs(zap.request.tags)

  // Verify that the zapper actually sent the requested amount (if it was supplied)
  if (amount && parseInt(amount) !== zap.invoiceAmount) {
    return undefined
  }

  // If the recipient and the zapper are the same person, it's legit
  if (responseMeta.p === response.pubkey) {
    return zap
  }

  // If the sending client provided an lnurl tag, verify that too
  if (lnurl && lnurl !== zapper?.lnurl) {
    return undefined
  }

  // Verify that the request actually came from the recipient's zapper
  if (zap.response.pubkey !== zapper?.nostrPubkey) {
    return undefined
  }

  return zap
}

export type ZapRequestParams = {
  msats: number
  zapper: Zapper
  pubkey: string
  relays: string[]
  content?: string
  eventId?: string
  anonymous?: boolean
}

export const makeZapRequest = ({
  msats,
  zapper,
  pubkey,
  relays,
  content = "",
  eventId,
  anonymous,
}: ZapRequestParams) => {
  const tags = [
    ["relays", ...relays],
    ["amount", String(msats)],
    ["lnurl", zapper.lnurl],
    ["p", pubkey],
  ]

  if (eventId) {
    tags.push(["e", eventId])
  }

  if (anonymous) {
    tags.push(["anon"])
  }

  return makeEvent(ZAP_REQUEST, {content, tags})
}

export type RequestInvoiceParams = {
  zapper: Zapper
  event: SignedEvent
}

export const requestZap = async ({zapper, event}: RequestInvoiceParams) => {
  const zapString = encodeURI(JSON.stringify(event))
  const msats = parseInt(getTagValue("amount", event.tags)!)
  const qs = `?amount=${msats}&nostr=${zapString}&lnurl=${zapper.lnurl}`
  const res = await tryCatch(() => fetchJson(zapper.callback + qs))

  return res?.pr ? {invoice: res.pr} : {error: res.reason || "Failed to request invoice"}
}

export type ZapResponseFilterParams = {
  zapper: Zapper
  pubkey: string
  eventId?: string
}

export const getZapResponseFilter = ({zapper, pubkey, eventId}: ZapResponseFilterParams) => {
  if (!zapper.nostrPubkey) {
    throw new Error("Zapper did not have a nostr pubkey")
  }

  const filter: Filter = {
    kinds: [ZAP_RESPONSE],
    authors: [zapper.nostrPubkey],
    since: now() - 30,
    "#p": [pubkey],
  }

  if (eventId) {
    filter["#e"] = [eventId]
  }

  return filter
}
