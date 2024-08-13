import {last, Emitter, normalizeUrl, sleep, stripProtocol} from '@welshman/lib'
import {matchFilters} from './Filters'
import type {Repository} from './Repository'
import type {Filter} from './Filters'
import type {CustomEvent} from './Events'

// Constants and types

export const LOCAL_RELAY_URL = "local://welshman.relay"

export const BOGUS_RELAY_URL = "bogus://welshman.relay"

export type RelayProfile = {
  url: string
  name?: string
  pubkey?: string
  contact?: string
  description?: string
  supported_nips?: number[]
  limitation?: {
    payment_required?: boolean
    auth_required?: boolean
  }
}

// Utils related to bare urls

export const isRelayUrl = (url: string) => {
  try {
    new URL(url)
  } catch (e) {
    return false
  }

  return true
}

export const isShareableRelayUrl = (url: string) =>
  Boolean(
    isRelayUrl(url) &&
    // Is it actually a websocket url and has a dot
    url.match(/^wss:\/\/.+\..+/) &&
    // Don't match stuff with a port number
    !url.slice(6).match(/:\d+/) &&
    // Don't match stuff with a numeric tld
    !url.slice(6).match(/\.\d+\b/) &&
    // Don't match raw ip addresses
    !url.slice(6).match(/\d+\.\d+\.\d+\.\d+/) &&
    // Skip nostr.wine's virtual relays
    !url.slice(6).match(/\/npub/)
  )

type NormalizeRelayUrlOpts = {
  allowInsecure?: boolean
}

export const normalizeRelayUrl = (url: string, {allowInsecure = false}: NormalizeRelayUrlOpts = {}) => {
  const prefix = allowInsecure ? url.match(/^wss?:\/\//)?.[0] || "wss://" : "wss://"

  // Use our library to normalize
  url = normalizeUrl(url, {stripHash: true, stripAuthentication: false})

  // Strip the protocol since only wss works, lowercase
  url = stripProtocol(url).toLowerCase()

  // Urls without pathnames are supposed to have a trailing slash
  if (!url.includes("/")) {
    url += "/"
  }

  return prefix + url
}

export const displayRelayUrl = (url: string) => last(url.split("://")).replace(/\/$/, "")

// In-memory relay implementation backed by Repository

export class Relay extends Emitter {
  subs = new Map<string, Filter[]>()

  constructor(readonly repository: Repository) {
    super()
  }

  send(type: string, ...message: any[]) {
    switch(type) {
      case 'EVENT': return this.handleEVENT(message as [CustomEvent])
      case 'CLOSE': return this.handleCLOSE(message as [string])
      case 'REQ': return this.handleREQ(message as [string, ...Filter[]])
    }
  }

  handleEVENT([event]: [CustomEvent]) {
    this.repository.publish(event)

    // Callers generally expect async relays
    sleep(1).then(() => {
      this.emit('OK', event.id, true, "")

      if (!this.repository.isDeleted(event)) {
        for (const [subId, filters] of this.subs.entries()) {
          if (matchFilters(filters, event)) {
            this.emit('EVENT', subId, event)
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
    sleep(1).then(() => {
      for (const event of this.repository.query(filters)) {
        this.emit('EVENT', subId, event)
      }

      this.emit('EOSE', subId)
    })
  }
}
