import {uniqBy, spec} from "@welshman/lib"
import {SEARCH_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-51 kind-10007 search relays list.
export class SearchRelayListReader extends EventReader {
  readonly kind = SEARCH_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeRelayUrl(url))
  }
}

export class SearchRelayListBuilder extends EventBuilder<SearchRelayListReader> {
  readonly kind = SEARCH_RELAYS

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

export const SearchRelayList = new Kind({
  reader: SearchRelayListReader,
  builder: SearchRelayListBuilder,
  router: OutboxRouter,
})
