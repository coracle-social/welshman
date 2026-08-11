import {noop, tryCatch, batcher, postJson} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {queryProfile, displayNip05} from "@welshman/util"
import type {Handle} from "@welshman/util"
import type {ProfileReader} from "@welshman/domain"
import {deriveDeduplicated} from "@welshman/store"
import {LoadableMapPlugin, projection} from "./base.js"
import type {Projection} from "./base.js"
import {Profiles} from "./profiles.js"

/**
 * NIP-05 handles, keyed by nip05 identifier. A "local" loadable collection:
 * items aren't nostr events, they're fetched over HTTP (either directly from
 * each domain's `.well-known/nostr.json`, or via a dufflepud proxy to protect
 * user privacy). Depends on the profiles collection to resolve a pubkey's
 * handle.
 */
export class Handles extends LoadableMapPlugin<Handle> {
  fetch = batcher(800, async (nip05s: string[]) => {
    const result = new Map<string, Handle>()

    // Use dufflepud if it's set up to protect user privacy, otherwise fetch directly
    if (this.app.config.dufflepudUrl) {
      const res: any = await tryCatch(
        async () =>
          await postJson(`${this.app.config.dufflepudUrl}/handle/info`, {handles: nip05s}),
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
    const $profile = await this.app.use(Profiles).load(pubkey, relays)

    const nip05 = $profile?.nip05()

    return nip05 ? this.load(nip05) : undefined
  }

  forPubkey = (pubkey: string, relays: string[] = []): Projection<Maybe<Handle>> => {
    this.loadForPubkey(pubkey, relays).catch(noop)

    const read = ([$handlesByNip05, $profile]: [
      ReadonlyMap<string, Handle>,
      Maybe<ProfileReader>,
    ]) => {
      const nip05 = $profile?.nip05()

      if (!nip05) return undefined

      const handle = $handlesByNip05.get(nip05)

      if (handle?.pubkey !== pubkey) return undefined

      return handle
    }

    return projection(
      deriveDeduplicated([this.index.$, this.app.use(Profiles).one(pubkey, relays)], read),
      () => read([this.index.get(), this.app.use(Profiles).get(pubkey)]),
    )
  }

  display = (nip05: string) => displayNip05(nip05)
}
