export const fromNostrURI = (s: string) => s.replace(/^[\w+]+:\/?\/?/, "")

export const toNostrURI = (s: string) => `nostr:${s}`
