import {uniq, spec} from "@welshman/lib"
import {MUTES, getPubkeyTagValues,
  userOutbox,
} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10000 mute list.
export class MuteListReader extends ListReader {
  readonly kind = MUTES

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }
}

export class MuteListWriter extends ListWriter<MuteListReader> {
  readonly kind = MUTES

  protected async routes() {
    return [userOutbox()]
  }

  mutePublicly(pubkey: string) {
    return this.addPublic(["p", pubkey])
  }

  mutePrivately(pubkey: string) {
    return this.addPrivate(["p", pubkey])
  }

  unmute(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }
}

export const MuteList = new KindFactory({
  reader: MuteListReader,
  writer: MuteListWriter,
})
