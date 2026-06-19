import {uniq, nthEq} from "@welshman/lib"
import {PINS, getEventTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10001 pin list. Pinned items are heterogeneous tags (typically
// 'e' events and optionally 'a' addresses), so they are exposed through
// type-specific accessors rather than a single id-only set. Items can be pinned
// publicly (tags) or privately (encrypted content); the reader merges both.
export class PinList extends ListReader {
  readonly kind = PINS

  ids() {
    return uniq(getEventTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  builder() {
    return new PinListBuilder(this)
  }
}

export class PinListBuilder extends ListBuilder<PinList> {
  readonly kind = PINS

  // Pin a full tag (e.g. ["e", id, ...] or ["a", address, ...]) publicly.
  pinPublicly(tag: string[]) {
    return this.addPublic(tag)
  }

  // Pin a full tag (e.g. ["e", id, ...] or ["a", address, ...]) privately.
  pinPrivately(tag: string[]) {
    return this.addPrivate(tag)
  }

  unpin(value: string) {
    return this.drop(nthEq(1, value))
  }
}
