export const stripProto = (url: string) => url.replace(/.*:\/\//, "")

export const isShareableRelay = (url: string) =>
  // Is it actually a websocket url
  url.match(/^wss:\/\/.+/) &&
  // Sometimes bugs cause multiple relays to get concatenated
  url.match(/:\/\//g)?.length === 1 &&
  // It shouldn't have any whitespace
  !url.match(/\s/) &&
  // Don't match stuff with a port number
  !url.slice(6).match(/:\d+/) &&
  // Don't match raw ip addresses
  !url.slice(6).match(/\d+\.\d+\.\d+\.\d+/) &&
  // Skip nostr.wine's virtual relays
  !url.slice(6).match(/\/npub/)

export const normalizeRelayUrl = (url: string) => {
  // If it doesn't start with a compatible protocol, strip the proto and add wss
  if (!url.match(/^(wss|local):\/\/.+/)) {
    url = "wss://" + stripProto(url)
  }

  try {
    return new URL(url).href.replace(/\/+$/, "").toLowerCase()
  } catch (e) {
    return null
  }
}

export const fromNostrURI = (s: string) => s.replace(/^[\w+]+:\/?\/?/, "")

export const toNostrURI = (s: string) => `nostr:${s}`
