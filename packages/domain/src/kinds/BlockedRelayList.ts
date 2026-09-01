import {uniq, spec} from "@welshman/lib"
import {BLOCKED_RELAYS, relayTags, tagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10006 blocked relays list.
export class BlockedRelayListReader extends EventReader {
  urls() {
    return uniq(tagValues(relayTags("relay"), this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }
}

export class BlockedRelayListWriter extends EventWriter<BlockedRelayListReader> {
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
  kind: BLOCKED_RELAYS,
  reader: BlockedRelayListReader,
  writer: BlockedRelayListWriter,
})
