import {last, normalizeUrl, stripProtocol} from "@welshman/lib"

// Utils related to bare urls

export const LOCAL_RELAY_URL = "local://welshman.relay/"

export const isRelayUrl = (url: string) => {
  if (!url.includes("://")) {
    url = "wss://" + url
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (e) {
    return false
  }

  // Skip non-ws urls
  if (!parsed.protocol.match(/^wss?:$/)) return false

  // Host is required (rejects local file paths like /home/foo/bar.png)
  if (!parsed.hostname) return false

  // Skip non-localhost hosts without a dot (checks host, not path)
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return false

  return true
}

export const isOnionUrl = (url: string) => Boolean(stripProtocol(url).match(/^[a-z2-7]{56}.onion/))

export const isLocalUrl = (url: string) =>
  Boolean(url.match(/\.local(:[\d]+)?\/?$/) || stripProtocol(url).match(/^localhost:/))

export const isIPAddress = (url: string) => Boolean(url.match(/\d+\.\d+\.\d+\.\d+/))

export const isShareableRelayUrl = (url: string) => Boolean(isRelayUrl(url) && !isLocalUrl(url))

export const normalizeRelayUrl = (url: string) => {
  if (url === LOCAL_RELAY_URL) return url

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
