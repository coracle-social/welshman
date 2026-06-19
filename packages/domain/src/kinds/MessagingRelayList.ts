import {uniqBy, nthEq} from "@welshman/lib"
import {MESSAGING_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-17 kind-10050 messaging/inbox relays. Entries are marker-less
// ['relay', url] tags (NOT NIP-65 'r' tags with read/write markers, and the
// RelayMode.Messaging marker is not used per-tag here). `urls()` drives where
// encrypted DM gift-wraps are sent and fetched, so it stays a flat, normalized
// set. Identical structure to BlockedRelayList/SearchRelayList.
export class MessagingRelayList extends ListReader {
  readonly kind = MESSAGING_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  builder() {
    return new MessagingRelayListBuilder(this)
  }
}

export class MessagingRelayListBuilder extends ListBuilder<MessagingRelayList> {
  readonly kind = MESSAGING_RELAYS

  addRelay(url: string) {
    return this.addPublic(["relay", normalizeRelayUrl(url)])
  }

  removeRelay(url: string) {
    return this.drop(nthEq(1, normalizeRelayUrl(url)))
  }

  setRelays(urls: string[]) {
    this.clear()

    return this.addPublic(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
  }
}
