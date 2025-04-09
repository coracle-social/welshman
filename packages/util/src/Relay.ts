import {last, normalizeUrl, stripProtocol} from "@welshman/lib"

// Constants and types

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

  // Skip non-localhost urls without a dot
  if (!url.match(/\./) && !url.includes('localhost')) return false

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
