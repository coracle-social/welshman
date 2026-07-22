import {uniq} from "@welshman/lib"
import {PINS, addressTags, hexTags, tagValues} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10001 pin list.
export class PinListReader extends ListReader {
  ids() {
    return uniq(tagValues(hexTags("e"), this.tags()))
  }

  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }
}

export class PinListWriter extends ListWriter<PinListReader> {
  pinPublicly(tag: string[]) {
    return this.addPublic(tag)
  }

  pinPrivately(tag: string[]) {
    return this.addPrivate(tag)
  }

  unpin(value: string) {
    return this.dropTags(t => ["e", "a"].includes(t[0] as string) && t[1] === value)
  }
}

export const PinList = new KindFactory({
  kind: PINS,
  reader: PinListReader,
  writer: PinListWriter,
})
