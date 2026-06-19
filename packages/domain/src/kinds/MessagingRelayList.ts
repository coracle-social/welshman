import {uniqBy, nthEq} from "@welshman/lib"
import {MESSAGING_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-17 kind-10050 messaging/inbox relays list.
export class MessagingRelayList extends ListReader {
  readonly kind = MESSAGING_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  builder() {
    return new MessagingRelayListBuilder(this)
  }
}

export class MessagingRelayListBuilder extends ListBuilder<MessagingRelayList> {
  readonly kind = MESSAGING_RELAYS

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
