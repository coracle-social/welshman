import {uniqBy} from "@welshman/lib"
import {BLOCKED_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10006 blocked relays. Entries are marker-less ['relay', url] tags
// (NOT NIP-65 'r' tags with read/write markers). `urls()` gates AUTH (never auth
// to a blocked relay) and relay selection, so it stays a flat, normalized set.
export class BlockedRelayList extends ListReader {
  static kind = BLOCKED_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }

  builder() {
    return this.seedList(new BlockedRelayListBuilder())
  }
}

export class BlockedRelayListBuilder extends ListBuilder {
  static kind = BLOCKED_RELAYS

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
