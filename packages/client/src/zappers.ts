import {writable} from "svelte/store"
import {
  removeUndefined,
  fetchJson,
  bech32ToHex,
  hexToBech32,
  tryCatch,
  batcher,
  postJson,
} from "@welshman/lib"
import {getTagValues, zapFromEvent} from "@welshman/util"
import type {Zapper, Zap, TrustedEvent} from "@welshman/util"
import {deriveDeduplicated} from "@welshman/store"
import {LoadableData} from "./clientData.js"
import type {IClient} from "./client.js"
import {Profiles} from "./profiles.js"

/**
 * Lightning zapper info, keyed by lnurl. A "local" loadable collection: items
 * aren't nostr events, they're fetched over HTTP (either directly from each
 * lnurl, or via a dufflepud proxy to protect user privacy). Depends on the
 * profiles collection to resolve a pubkey's lnurl.
 */
export class Zappers extends LoadableData<Zapper> {
  constructor(ctx: IClient) {
    super(ctx)
  }

  fetch = batcher(800, async (lnurls: string[]) => {
    const result = new Map<string, Zapper>()
    const valid = lnurls.filter(lnurl => lnurl.startsWith("lnurl1"))

    const addZapper = (lnurl: string, info: any) => {
      if (info) {
        try {
          result.set(lnurl, {...info, lnurl})
        } catch (_e) {
          // pass
        }
      }
    }

    // Use dufflepud if it's set up to protect user privacy, otherwise fetch directly
    if (this.ctx.config.dufflepudUrl) {
      const hexUrls = valid.map(bech32ToHex)
      const res: any = await tryCatch(
        async () =>
          await postJson(`${this.ctx.config.dufflepudUrl}/zapper/info`, {lnurls: hexUrls}),
      )

      for (const {lnurl, info} of res?.data || []) {
        addZapper(hexToBech32("lnurl", lnurl), info)
      }
    } else {
      await Promise.all(
        valid.map(async lnurl => {
          addZapper(lnurl, await tryCatch(async () => await fetchJson(bech32ToHex(lnurl))))
        }),
      )
    }

    for (const [lnurl, zapper] of result) {
      this.set(lnurl, zapper)
    }

    return lnurls.map(lnurl => result.get(lnurl))
  })

  loadForPubkey = async (pubkey: string, relays: string[] = []) => {
    const $profile = await this.ctx.use(Profiles).load(pubkey, relays)

    return $profile?.lnurl ? this.load($profile.lnurl) : undefined
  }

  deriveForPubkey = (pubkey: string, relays: string[] = []) => {
    this.loadForPubkey(pubkey, relays)

    return deriveDeduplicated(
      [this.index, this.ctx.use(Profiles).derive(pubkey, relays)],
      ([$zappersByLnurl, $profile]) =>
        $profile?.lnurl ? $zappersByLnurl.get($profile.lnurl) : undefined,
    )
  }

  getLnUrlsForEvent = async (event: TrustedEvent) => {
    const pubkeys = getTagValues("zap", event.tags)

    if (pubkeys.length > 0) {
      const profiles = await Promise.all(pubkeys.map(pubkey => this.ctx.use(Profiles).load(pubkey)))
      const lnurls = removeUndefined(profiles.map(profile => profile?.lnurl))

      if (lnurls.length > 0) {
        return lnurls
      }
    }

    const profile = await this.ctx.use(Profiles).load(event.pubkey)

    return removeUndefined([profile?.lnurl])
  }

  getZapperForZap = async (zap: TrustedEvent, parent: TrustedEvent) => {
    const lnurls = await this.getLnUrlsForEvent(parent)

    return lnurls.length > 0 ? this.load(lnurls[0]) : undefined
  }

  getValidZap = async (zap: TrustedEvent, parent: TrustedEvent) => {
    const zapper = await this.getZapperForZap(zap, parent)

    return zapper ? zapFromEvent(zap, zapper) : undefined
  }

  getValidZaps = async (zaps: TrustedEvent[], parent: TrustedEvent) =>
    removeUndefined(await Promise.all(zaps.map(zap => this.getValidZap(zap, parent))))

  deriveValidZaps = (zaps: TrustedEvent[], parent: TrustedEvent) => {
    const store = writable<Zap[]>([])

    this.getValidZaps(zaps, parent).then(validZaps => {
      store.set(validZaps)
    })

    return store
  }
}
