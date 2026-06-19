import {uniqBy, nthEq} from "@welshman/lib"
import {BLOCKED_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10006 blocked relays list.
export class BlockedRelayList extends ListReader {
  readonly kind = BLOCKED_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }

  builder() {
    return new BlockedRelayListBuilder(this)
  }
}

export class BlockedRelayListBuilder extends ListBuilder<BlockedRelayList> {
  readonly kind = BLOCKED_RELAYS

  addUrl(url: string) {
    return this.addPublic(["relay", normalizeRelayUrl(url)])
  }

  removeUrl(url: string) {
    return this.drop(nthEq(1, normalizeRelayUrl(url)))
  }

  setUrls(urls: string[]) {
    this.clear()

    return this.addPublic(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
  }
}
