import {FOLLOWS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {Collection, CollectionRepositoryBackend} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const follows = new Collection({
  backend: new CollectionRepositoryBackend<PublishedList>("follows", {
    repository,
    filters: [{kinds: [FOLLOWS]}],
    fetch: makeOutboxLoader(FOLLOWS),
    itemToEvent: item => item.event,
    eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
    getKey: list => list.event.pubkey,
  }),
})
