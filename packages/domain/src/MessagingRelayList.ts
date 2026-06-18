import {uniqBy} from "@welshman/lib"
import {MESSAGING_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-17 kind-10050 messaging/inbox relays. Entries are marker-less
// ['relay', url] tags (NOT NIP-65 'r' tags with read/write markers, and the
// RelayMode.Messaging marker is not used per-tag here). `urls()` drives where
// encrypted DM gift-wraps are sent and fetched, so it stays a flat, normalized
// set. Identical structure to BlockedRelayList/SearchRelayList.
export class MessagingRelayList extends EncryptableList {
  readonly kind = MESSAGING_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  addRelay(url: string) {
    return this.addPublicTags(["relay", normalizeRelayUrl(url)])
  }

  removeRelay(url: string) {
    return this.removeTagsWithValue(url)
  }

  setRelays(urls: string[]) {
    this.keepTagsWithKey("relay")

    return this.addPublicTags(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
  }
}
