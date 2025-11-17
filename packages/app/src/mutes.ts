import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {Collection, CollectionRepositoryBackend} from "@welshman/store"
import {repository} from "./core.js"
import {ensurePlaintext} from "./plaintext.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const mutes = new Collection({
  backend: new CollectionRepositoryBackend<PublishedList>("mutes", {
    repository,
    filters: [{kinds: [MUTES]}],
    fetch: makeOutboxLoader(MUTES),
    itemToEvent: item => item.event,
    eventToItem: async (event: TrustedEvent) =>
      readList(
        asDecryptedEvent(event, {
          content: await ensurePlaintext(event),
        }),
      ),
    getKey: list => list.event.pubkey,
  }),
})
