import {tryCatch, batcher, postJson} from "@welshman/lib"
import {queryProfile, displayNip05} from "@welshman/util"
import type {Handle} from "@welshman/util"
import {deriveDeduplicated} from "@welshman/store"
import {LoadableData} from "./clientData.js"
import type {IClient} from "./client.js"
import {Profiles} from "./profiles.js"

/**
 * NIP-05 handles, keyed by nip05 identifier. A "local" loadable collection:
 * items aren't nostr events, they're fetched over HTTP (either directly from
 * each domain's `.well-known/nostr.json`, or via a dufflepud proxy to protect
 * user privacy). Depends on the profiles collection to resolve a pubkey's
 * handle.
 */
export class Handles extends LoadableData<Handle> {
  constructor(ctx: IClient) {
    super(ctx)
  }

  fetch = batcher(800, async (nip05s: string[]) => {
    const result = new Map<string, Handle>()

    // Use dufflepud if it's set up to protect user privacy, otherwise fetch directly
    if (this.ctx.config.dufflepudUrl) {
      const res: any = await tryCatch(
        async () =>
          await postJson(`${this.ctx.config.dufflepudUrl}/handle/info`, {handles: nip05s}),
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
    const $profile = await this.ctx.use(Profiles).load(pubkey, relays)

    return $profile?.nip05 ? this.load($profile.nip05) : undefined
  }

  forPubkey = (pubkey: string, relays: string[] = []) => {
    this.loadForPubkey(pubkey, relays)

    return deriveDeduplicated(
      [this.index, this.ctx.use(Profiles).one(pubkey, relays)],
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
