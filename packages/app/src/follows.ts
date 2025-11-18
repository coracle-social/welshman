import {FOLLOWS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {makeMappedCollection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const follows = makeMappedCollection<PublishedList>({
  repository,
  name: "follows",
  filters: [{kinds: [FOLLOWS]}],
  getKey: list => list.event.pubkey,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  load: makeOutboxLoader(FOLLOWS),
})
