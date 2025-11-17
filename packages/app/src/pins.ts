import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {makeSimpleRepositoryCollection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const pins = makeSimpleRepositoryCollection<PublishedList>({
  repository,
  name: "pins",
  filters: [{kinds: [PINS]}],
  fetch: makeOutboxLoader(PINS),
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  getKey: list => list.event.pubkey,
})
