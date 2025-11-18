import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {makeMappedCollection} from "@welshman/store"
import {repository} from "./core.js"
import {ensurePlaintext} from "./plaintext.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const mutes = makeMappedCollection<PublishedList>({
  repository,
  name: "mutes",
  filters: [{kinds: [MUTES]}],
  getKey: list => list.event.pubkey,
  eventToItem: async (event: TrustedEvent) =>
    readList(
      asDecryptedEvent(event, {
        content: await ensurePlaintext(event),
      }),
    ),
  load: makeOutboxLoader(MUTES),
})
