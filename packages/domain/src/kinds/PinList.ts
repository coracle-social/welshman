import {uniq} from "@welshman/lib"
import {PINS, getEventTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10001 pin list.
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

  pinPublicly(tag: string[]) {
    return this.addPublic(tag)
  }

  pinPrivately(tag: string[]) {
    return this.addPrivate(tag)
  }

  unpin(value: string) {
    return this.dropTags(t => ["e", "a"].includes(t[0]) && t[1] === value)
  }
}
