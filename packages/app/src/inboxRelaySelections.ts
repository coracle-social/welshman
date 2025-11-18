import {INBOX_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {makeMappedCollection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const inboxRelaySelections = makeMappedCollection<PublishedList>({
  repository,
  name: "inboxRelaySelections",
  filters: [{kinds: [INBOX_RELAYS]}],
  getKey: list => list.event.pubkey,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  load: makeOutboxLoader(INBOX_RELAYS),
})
