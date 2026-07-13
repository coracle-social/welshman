import {uniqBy, spec} from "@welshman/lib"
import {BLOCKED_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// NIP-51 kind-10006 blocked relays list.
export class BlockedRelayListReader extends EventReader {
  readonly kind = BLOCKED_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }
}

export class BlockedRelayListWriter extends EventWriter<BlockedRelayListReader> {
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

export const BlockedRelayList = new KindFactory({
  reader: BlockedRelayListReader,
  writer: BlockedRelayListWriter,
})
