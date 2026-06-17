import {fetchJson, last} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"

/**
 * NIP-05: mapping nostr public keys to DNS-based internet identifiers (e.g.
 * `name@example.com`), resolved via each domain's `/.well-known/nostr.json`.
 */
export type Handle = {
  nip05: string
  pubkey?: string
  nip46?: string[]
  relays?: string[]
}

export async function queryProfile(nip05: string): Promise<Maybe<Handle>> {
  const parts = nip05.split("@")
  const name = parts.length > 1 ? parts[0] : "_"
  const domain = last(parts)

  try {
    const {
      names,
      relays = {},
      nip46 = {},
    } = await fetchJson(`https://${domain}/.well-known/nostr.json?name=${name}`)

    const pubkey = names[name]

    if (!pubkey) {
      return undefined
    }

    return {
      nip05,
      pubkey,
      nip46: nip46[pubkey],
      relays: relays[pubkey],
    }
  } catch (_e) {
    return undefined
  }
}

export const displayNip05 = (nip05: string) =>
  nip05?.startsWith("_@") ? last(nip05.split("@")) : nip05

export const displayHandle = (handle: Handle) => displayNip05(handle.nip05)
