import {uniq, spec} from "@welshman/lib"
import {
  BLOCKED_RELAYS,
  relayTags,
  tagValueMatcher,
  tagValues,
  normalizeRelayUrl,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

const urlSpec = relayTags("relay")

// NIP-51 kind-10006 blocked relays list.
export class BlockedRelayListReader extends EventReader {
  urls() {
    return uniq(tagValues(urlSpec, this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }
}

export class BlockedRelayListWriter extends EventWriter<BlockedRelayListReader> {
  addUrl(url: string) {
    const normalized = normalizeRelayUrl(url)

    return this.dropTags(tagValueMatcher(urlSpec, normalized)).addTags(["relay", normalized])
  }

  removeUrl(url: string) {
    return this.dropTags(tagValueMatcher(urlSpec, normalizeRelayUrl(url)))
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
