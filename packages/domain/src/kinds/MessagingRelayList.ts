import {uniqBy, spec} from "@welshman/lib"
import {MESSAGING_RELAYS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {IndexedRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-17 kind-10050 messaging/inbox relays list.
export class MessagingRelayListReader extends EventReader {
  readonly kind = MESSAGING_RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }
}

export class MessagingRelayListBuilder extends EventBuilder<MessagingRelayListReader> {
  readonly kind = MESSAGING_RELAYS

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

export const MessagingRelayList = new Kind({
  reader: MessagingRelayListReader,
  builder: MessagingRelayListBuilder,
  router: IndexedRouter,
})
