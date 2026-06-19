import {uniqBy, nthEq} from "@welshman/lib"
import {SEARCH_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10007 search relays (NIP-50). Entries are marker-less
// ['relay', url] tags (NOT NIP-65 'r' tags with read/write markers). Identical
// structure to BlockedRelayList; `urls()` stays a flat, normalized set.
export class SearchRelayList extends ListReader {
  readonly kind = SEARCH_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }

  builder() {
    return new SearchRelayListBuilder(this)
  }
}

export class SearchRelayListBuilder extends ListBuilder<SearchRelayList> {
  readonly kind = SEARCH_RELAYS

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
