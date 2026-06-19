import {uniq, nthEq} from "@welshman/lib"
import {FEEDS, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10014 saved feeds list.
export class FeedList extends ListReader {
  readonly kind = FEEDS

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  includes(address: string) {
    return this.addresses().includes(address)
  }

  builder() {
    return new FeedListBuilder(this)
  }
}

export class FeedListBuilder extends ListBuilder<FeedList> {
  readonly kind = FEEDS

  addFeed(address: string, relayHint?: string) {
    return this.addPublic(["a", address, relayHint || ""])
  }

  addFeedPrivately(address: string, relayHint?: string) {
    return this.addPrivate(["a", address, relayHint || ""])
  }

  removeFeed(address: string) {
    return this.drop(nthEq(1, address))
  }
}
