import {INBOX_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {makeSimpleRepositoryCollection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const inboxRelaySelections = makeSimpleRepositoryCollection<PublishedList>({
  repository,
  name: "inboxRelaySelections",
  filters: [{kinds: [INBOX_RELAYS]}],
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  getKey: list => list.event.pubkey,
  fetch: makeOutboxLoader(INBOX_RELAYS),
})
