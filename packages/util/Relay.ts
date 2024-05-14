import {Emitter, normalizeUrl, stripProtocol} from '@welshman/lib'
import {matchFilters} from './Filters'
import type {Repository} from './Repository'
import type {Filter} from './Filters'
import type {TrustedEvent} from './Events'

export const LOCAL_RELAY_URL = "local://welshman.relay"

export const BOGUS_RELAY_URL = "bogus://welshman.relay"

export const isShareableRelayUrl = (url: string) =>
  Boolean(
    typeof url === 'string' &&
    // Is it actually a websocket url and has a dot
    url.match(/^wss:\/\/.+\..+/) &&
    // Sometimes bugs cause multiple relays to get concatenated
    url.match(/:\/\//g)?.length === 1 &&
    // It shouldn't have any whitespace, url-encoded or otherwise
    !url.match(/\s|%/) &&
    // Don't match stuff with a port number
    !url.slice(6).match(/:\d+/) &&
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

export class Relay extends Emitter {
  subs = new Map<string, Filter[]>()

  constructor(readonly repository: Repository) {
    super()
  }

  send(type: string, ...message: any[]) {
    switch(type) {
      case 'EVENT': return this.handleEVENT(message as [TrustedEvent])
      case 'CLOSE': return this.handleCLOSE(message as [string])
      case 'REQ': return this.handleREQ(message as [string, ...Filter[]])
    }
  }

  handleEVENT([event]: [TrustedEvent]) {
    this.repository.publish(event)

    this.emit('OK', event.id, true, "")

    if (!this.repository.isDeleted(event)) {
      for (const [subId, filters] of this.subs.entries()) {
        if (matchFilters(filters, event)) {
          this.emit('EVENT', subId, event)
        }
      }
    }
  }

  handleCLOSE([subId]: [string]) {
    this.subs.delete(subId)
  }

  handleREQ([subId, ...filters]: [string, ...Filter[]]) {
    this.subs.set(subId, filters)

    for (const event of this.repository.query(filters)) {
      this.emit('EVENT', subId, event)
    }

    this.emit('EOSE', subId)
  }
}
