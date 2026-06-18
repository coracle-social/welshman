import {uniqBy} from "@welshman/lib"
import {SEARCH_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10007 search relays (NIP-50). Entries are marker-less
// ['relay', url] tags (NOT NIP-65 'r' tags with read/write markers). Identical
// structure to BlockedRelayList; `urls()` stays a flat, normalized set.
export class SearchRelayList extends EncryptableList {
  readonly kind = SEARCH_RELAYS

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
