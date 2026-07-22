import {uniqBy, spec} from "@welshman/lib"
import {MESSAGING_RELAYS, tagSpec, tagValues, normalizeRelayUrl} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-17 kind-10050 messaging/inbox relays list.
export class MessagingRelayListReader extends EventReader {
  urls() {
    return uniqBy(normalizeRelayUrl, tagValues(tagSpec("relay"), this.tags()))
  }
}

export class MessagingRelayListWriter extends EventWriter<MessagingRelayListReader> {
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

export const MessagingRelayList = new KindFactory({
  kind: MESSAGING_RELAYS,
  reader: MessagingRelayListReader,
  writer: MessagingRelayListWriter,
})
