import {uniqBy} from "@welshman/lib"
import {SEARCH_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10007 search relays (NIP-50). Entries are marker-less
// ['relay', url] tags (NOT NIP-65 'r' tags with read/write markers). Identical
// structure to BlockedRelayList; `urls()` stays a flat, normalized set.
export class SearchRelayList extends ListReader {
  static kind = SEARCH_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }

  builder() {
    return this.seedList(new SearchRelayListBuilder())
  }
}

export class SearchRelayListBuilder extends ListBuilder {
  static kind = SEARCH_RELAYS

  addRelay(url: string) {
    return this.addPublicTags(["relay", normalizeRelayUrl(url)])
  }

  removeRelay(url: string) {
    return this.removeTagsWithValue(normalizeRelayUrl(url))
  }

  setRelays(urls: string[]) {
    this.clearTags()

    return this.addPublicTags(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
  }
}
