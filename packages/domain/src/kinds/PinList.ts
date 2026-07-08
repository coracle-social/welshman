import {uniq} from "@welshman/lib"
import {PINS, getEventTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-51 kind-10001 pin list.
export class PinListReader extends ListReader {
  readonly kind = PINS

  ids() {
    return uniq(getEventTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }
}

export class PinListBuilder extends ListBuilder<PinListReader> {
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

export const PinList = new Kind({
  reader: PinListReader,
  builder: PinListBuilder,
  router: OutboxRouter,
})
