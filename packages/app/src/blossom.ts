import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {makeMappedCollection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const blossomServers = makeMappedCollection<PublishedList>({
  repository,
  name: "blossomServers",
  filters: [{kinds: [BLOSSOM_SERVERS]}],
  getKey: list => list.event.pubkey,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  load: makeOutboxLoader(BLOSSOM_SERVERS),
})
