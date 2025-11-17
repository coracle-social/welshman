import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {Collection, CollectionRepositoryBackend} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const blossomServers = new Collection({
  backend: new CollectionRepositoryBackend<PublishedList>("blossomServers", {
    repository,
    filters: [{kinds: [BLOSSOM_SERVERS]}],
    fetch: makeOutboxLoader(BLOSSOM_SERVERS),
    itemToEvent: item => item.event,
    eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
    getKey: list => list.event.pubkey,
  }),
})
