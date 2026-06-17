import type {Readable} from "svelte/store"
import {
  removeUndefined,
  fetchJson,
  bech32ToHex,
  hexToBech32,
  tryCatch,
  batcher,
  postJson,
} from "@welshman/lib"
import {getTagValue, getZapSplits, zapFromEvent} from "@welshman/util"
import type {Zapper, Zap, TrustedEvent} from "@welshman/util"
import {deriveDeduplicated, deriveDeduplicatedByValue} from "@welshman/store"
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
      [this.index, this.ctx.use(Profiles).derived(pubkey, relays)],
      ([$zappersByLnurl, $profile]) =>
        $profile?.lnurl ? $zappersByLnurl.get($profile.lnurl) : undefined,
    )
  }

  /**
   * Resolve the zapper a zap receipt should be validated against. A receipt's
   * `p` tag is the recipient (copied from the zap request), so we honor only
   * receipts addressed to one of the parent's designated split recipients and
   * load *that* recipient's zapper. The old lookup always used the first
   * recipient's lnurl, which silently dropped legitimate zaps to any of the
   * other split recipients.
   */
  loadZapperForZap = async (zapReceipt: TrustedEvent, parent: TrustedEvent) => {
    const recipient = getTagValue("p", zapReceipt.tags)
    const split = getZapSplits(parent).find(split => split.pubkey === recipient)

    if (!split) return

    return this.loadForPubkey(split.pubkey, removeUndefined([split.relay]))
  }

  validateZapReceipt = async (zapReceipt: TrustedEvent, parent: TrustedEvent) => {
    const zapper = await this.loadZapperForZap(zapReceipt, parent)

    return zapper ? zapFromEvent(zapReceipt, zapper) : undefined
  }

  validateZapReceipts = async (zapReceipts: TrustedEvent[], parent: TrustedEvent) =>
    removeUndefined(
      await Promise.all(zapReceipts.map(zapReceipt => this.validateZapReceipt(zapReceipt, parent))),
    )

  deriveValidZapReceipts = (zapReceipts: TrustedEvent[], parent: TrustedEvent): Readable<Zap[]> => {
    const splits = getZapSplits(parent)
    const profiles = this.ctx.use(Profiles)

    // Ensure each recipient's profile (-> lnurl) and zapper are being loaded.
    for (const split of splits) {
      this.loadForPubkey(split.pubkey, removeUndefined([split.relay]))
    }

    const stores: Readable<any>[] = [
      this.index,
      ...splits.map(split => profiles.derived(split.pubkey)),
    ]

    return deriveDeduplicatedByValue(stores, (values: any[]) => {
      const $zappersByLnurl = values[0] as Map<string, Zapper>
      const $profiles = values.slice(1) as Array<{lnurl?: string} | undefined>

      const zapperByPubkey = new Map<string, Zapper>()

      splits.forEach((split, i) => {
        const lnurl = $profiles[i]?.lnurl
        const zapper = lnurl ? $zappersByLnurl.get(lnurl) : undefined

        if (zapper) zapperByPubkey.set(split.pubkey, zapper)
      })

      return removeUndefined(
        zapReceipts.map(zapReceipt => {
          const recipient = getTagValue("p", zapReceipt.tags)
          const zapper = recipient ? zapperByPubkey.get(recipient) : undefined

          return zapper ? zapFromEvent(zapReceipt, zapper) : undefined
        }),
      )
    })
  }
}
