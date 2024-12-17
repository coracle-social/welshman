export const fromNostrURI = (s: string) => s.replace(/^nostr:\/?\/?/, "")

export const toNostrURI = (s: string) => (s.startsWith("nostr:") ? s : `nostr:${s}`)
