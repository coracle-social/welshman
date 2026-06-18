import {uniqBy} from "@welshman/lib"
import {BLOCKED_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10006 blocked relays. Entries are marker-less ['relay', url] tags
// (NOT NIP-65 'r' tags with read/write markers). `urls()` gates AUTH (never auth
// to a blocked relay) and relay selection, so it stays a flat, normalized set.
export class BlockedRelayList extends EncryptableList {
  readonly kind = BLOCKED_RELAYS

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
