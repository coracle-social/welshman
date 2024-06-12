export const fromNostrURI = (s: string) => s.replace(/^nostr:\/?\/?/, "")

export const toNostrURI = (s: string) => `nostr:${s}`
