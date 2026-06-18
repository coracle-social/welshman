import {uniq} from "@welshman/lib"
import {PINS, getEventTagValues, getAddressTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10001 pin list. Pinned items are heterogeneous tags (typically
// 'e' events and optionally 'a' addresses), so they are exposed through
// type-specific accessors rather than a single id-only set.
export class PinList extends EncryptableList {
  readonly kind = PINS

  ids() {
    return uniq(getEventTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  // Pin a full tag (e.g. ["e", id, ...] or ["a", address, ...]) publicly.
  pin(tag: string[]) {
    return this.addPublicTags(tag)
  }

  unpin(value: string) {
    return this.removeTagsWithValue(value)
  }
}
