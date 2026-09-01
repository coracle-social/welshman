import {uniq, spec} from "@welshman/lib"
import {SEARCH_RELAYS, relayTags, tagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10007 search relays list.
export class SearchRelayListReader extends EventReader {
  urls() {
    return uniq(tagValues(relayTags("relay"), this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }
}

export class SearchRelayListWriter extends EventWriter<SearchRelayListReader> {
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

export const SearchRelayList = new KindFactory({
  kind: SEARCH_RELAYS,
  reader: SearchRelayListReader,
  writer: SearchRelayListWriter,
})
