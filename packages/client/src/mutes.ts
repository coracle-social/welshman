import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent, PublishedList} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import type {IClient} from "./client.js"
import {RelayLists} from "./relayLists.js"
import {Plaintext} from "./plaintext.js"

/**
 * Kind-10000 mute lists, keyed by pubkey. Mute lists carry private entries in
 * encrypted content, so decoding goes through the plaintext cache.
 */
export class MuteLists extends RepositoryCollection<PublishedList> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [MUTES]}],
      eventToItem: async (event: TrustedEvent) => {
        const content = await ctx.use(Plaintext).ensure(event)

        // If this is our own mute list but it couldn't be decrypted yet because
        // no signer is available, don't cache a result with empty private tags —
        // that would get stuck permanently since the repository view won't
        // re-process an already-seen event id. Returning undefined leaves it
        // uncached so it's retried once a signer is available. For other
        // pubkeys' lists we fall through and read just the public tags.
        if (event.content && content === undefined && event.pubkey === ctx.user?.pubkey) {
          return undefined
        }

        return readList(asDecryptedEvent(event, {content}))
      },
      getKey: mute => mute.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(RelayLists).makeOutboxLoader(MUTES)(pubkey, relayHints)
  }
}
