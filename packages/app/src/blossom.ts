import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveEventsMapped, collection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const blossomServers = deriveEventsMapped<PublishedList>(repository, {
  filters: [{kinds: [BLOSSOM_SERVERS]}],
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
})

export const {
  indexStore: blossomServersByPubkey,
  deriveItem: deriveBlossomServers,
  loadItem: loadBlossomServers,
} = collection({
  name: "blossomServers",
  store: blossomServers,
  getKey: blossomServers => blossomServers.event.pubkey,
  load: makeOutboxLoader(BLOSSOM_SERVERS),
})
