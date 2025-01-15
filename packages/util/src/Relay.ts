import {last, Emitter, normalizeUrl, sleep, stripProtocol} from "@welshman/lib"
import {matchFilters} from "./Filters.js"
import type {Repository} from "./Repository.js"
import type {Filter} from "./Filters.js"
import type {HashedEvent, TrustedEvent} from "./Events.js"

// Constants and types

export const LOCAL_RELAY_URL = "local://welshman.relay/"

export const BOGUS_RELAY_URL = "bogus://welshman.relay/"

export type RelayProfile = {
  url: string
  icon?: string
  banner?: string
  name?: string
  pubkey?: string
  contact?: string
  software?: string
  version?: string
  description?: string
  supported_nips?: number[]
  limitation?: {
    min_pow_difficulty?: number
    payment_required?: boolean
    auth_required?: boolean
  }
}

// Utils related to bare urls

export const isRelayUrl = (url: string) => {
  if (!url.includes("://")) {
    url = "wss://" + url
  }

  // Skip non-ws urls
  if (!url.match(/^wss?:\/\//)) return false

  // Skip urls with a slash before the dot
  if (url.match(/\\.*\./)) return false

  // Skip urls without a dot
  if (!url.match(/\./)) return false

  try {
    new URL(url)
  } catch (e) {
    return false
  }

  return true
}

export const isOnionUrl = (url: string) => Boolean(stripProtocol(url).match(/^[a-z2-7]{56}.onion/))

export const isLocalUrl = (url: string) =>
  Boolean(url.match(/\.local(:[\d]+)?\/?$/) || stripProtocol(url).match(/^localhost:/))

export const isIPAddress = (url: string) => Boolean(url.match(/\d+\.\d+\.\d+\.\d+/))

export const isShareableRelayUrl = (url: string) => Boolean(isRelayUrl(url) && !isLocalUrl(url))

export const normalizeRelayUrl = (url: string) => {
  const prefix = url.match(/^wss?:\/\//)?.[0] || (isOnionUrl(url) ? "ws://" : "wss://")

  // Use our library to normalize
  url = normalizeUrl(url, {stripHash: true, stripAuthentication: false})

  // Strip the protocol, lowercase
  url = stripProtocol(url).toLowerCase()

  // Urls without pathnames are supposed to have a trailing slash
  if (!url.includes("/")) {
    url += "/"
  }

  return prefix + url
}

export const displayRelayUrl = (url: string) => last(url.split("://")).replace(/\/$/, "")

export const displayRelayProfile = (profile?: RelayProfile, fallback = "") =>
  profile?.name || fallback

// In-memory relay implementation backed by Repository

export class Relay<E extends HashedEvent = TrustedEvent> extends Emitter {
  subs = new Map<string, Filter[]>()

  constructor(readonly repository: Repository<E>) {
    super()
  }

  send(type: string, ...message: any[]) {
    switch (type) {
      case "EVENT":
        return this.handleEVENT(message as [E])
      case "CLOSE":
        return this.handleCLOSE(message as [string])
      case "REQ":
        return this.handleREQ(message as [string, ...Filter[]])
    }
  }

  handleEVENT([event]: [E]) {
    this.repository.publish(event)

    // Callers generally expect async relays
    void sleep(1).then(() => {
      this.emit("OK", event.id, true, "")

      if (!this.repository.isDeleted(event)) {
        for (const [subId, filters] of this.subs.entries()) {
          if (matchFilters(filters, event)) {
            this.emit("EVENT", subId, event)
          }
        }
      }
    })
  }

  handleCLOSE([subId]: [string]) {
    this.subs.delete(subId)
  }

  handleREQ([subId, ...filters]: [string, ...Filter[]]) {
    this.subs.set(subId, filters)

    // Callers generally expect async relays
    void sleep(1).then(() => {
      for (const event of this.repository.query(filters)) {
        this.emit("EVENT", subId, event)
      }

      this.emit("EOSE", subId)
    })
  }
}
