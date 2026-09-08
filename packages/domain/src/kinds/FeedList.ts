import {uniq, spec} from "@welshman/lib"
import {FEEDS, addressTags, tagValues} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10014 saved feeds list.
export class FeedListReader extends ListReader {
  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }

  includes(address: string) {
    return this.addresses().includes(address)
  }
}

export class FeedListWriter extends ListWriter<FeedListReader> {
  addFeed(address: string, relayHint?: string) {
    return this.addPublic(["a", address, relayHint || ""])
  }

  addFeedPrivately(address: string, relayHint?: string) {
    return this.addPrivate(["a", address, relayHint || ""])
  }

  removeFeed(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}

export class FeedListQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const FeedList = new KindFactory({
  kind: FEEDS,
  reader: FeedListReader,
  writer: FeedListWriter,
  query: FeedListQuery,
})
