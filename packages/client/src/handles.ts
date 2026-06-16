import {tryCatch, fetchJson, batcher, postJson, last} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {deriveDeduplicated} from "@welshman/store"
import {LoadableData} from "./clientData.js"
import type {ClientContext} from "./client.js"
import type {Profiles} from "./profiles.js"

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

/**
 * NIP-05 handles, keyed by nip05 identifier. A "local" loadable collection:
 * items aren't nostr events, they're fetched over HTTP (either directly from
 * each domain's `.well-known/nostr.json`, or via a dufflepud proxy to protect
 * user privacy). Depends on the profiles collection to resolve a pubkey's
 * handle.
 */
export class Handles extends LoadableData<Handle> {
  constructor(
    ctx: ClientContext,
    readonly profiles: Profiles,
    readonly options: {dufflepudUrl?: string} = {},
  ) {
    super(ctx)
  }

  fetch = batcher(800, async (nip05s: string[]) => {
    const result = new Map<string, Handle>()

    // Use dufflepud if it's set up to protect user privacy, otherwise fetch directly
    if (this.options.dufflepudUrl) {
      const res: any = await tryCatch(
        async () => await postJson(`${this.options.dufflepudUrl}/handle/info`, {handles: nip05s}),
      )

      for (const {handle: nip05, info} of res?.data || []) {
        if (info) {
          result.set(nip05, {...info, nip05})
        }
      }
    } else {
      const results = await Promise.all(
        nip05s.map(async nip05 => ({
          nip05,
          info: await tryCatch(async () => await queryProfile(nip05)),
        })),
      )

      for (const {nip05, info} of results) {
        if (info) {
          result.set(nip05, {...info, nip05})
        }
      }
    }

    for (const [nip05, info] of result) {
      this.set(nip05, info)
    }

    return nip05s.map(nip05 => result.get(nip05))
  })

  loadForPubkey = async (pubkey: string, relays: string[] = []) => {
    const $profile = await this.profiles.load(pubkey, relays)

    return $profile?.nip05 ? this.load($profile.nip05) : undefined
  }

  deriveForPubkey = (pubkey: string, relays: string[] = []) => {
    this.loadForPubkey(pubkey, relays)

    return deriveDeduplicated(
      [this.index, this.profiles.derive(pubkey, relays)],
      ([$handlesByNip05, $profile]) => {
        if (!$profile?.nip05) return undefined

        const handle = $handlesByNip05.get($profile.nip05)

        if (handle?.pubkey !== pubkey) return undefined

        return handle
      },
    )
  }

  display = (nip05: string) => displayNip05(nip05)
}
