import {normalizeUrl, stripProtocol} from "../util"

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

export const normalizeRelayUrl = (url: string) => {
  // Use our library to normalize
  url = normalizeUrl(url, {stripHash: true, stripAuthentication: false})

  // Strip the protocol since only wss works
  url = stripProtocol(url)

  // Urls without pathnames are supposed to have a trailing slash
  if (!url.includes("/")) {
    url += "/"
  }

  return "wss://" + url
}
