import {uniqBy, spec} from "@welshman/lib"
import {BLOCKED_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-51 kind-10006 blocked relays list.
export class BlockedRelayList extends EventReader {
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

export class BlockedRelayListBuilder extends EventBuilder<BlockedRelayList> {
  readonly kind = BLOCKED_RELAYS

  addUrl(url: string) {
    return this.addTags(["relay", normalizeRelayUrl(url)])
  }

  removeUrl(url: string) {
    return this.dropTags(spec(["relay", normalizeRelayUrl(url)]))
  }

  setUrls(urls: string[]) {
    return this.dropTags(spec(["relay"])).addTags(
      ...urls.map(url => ["relay", normalizeRelayUrl(url)]),
    )
  }
}
