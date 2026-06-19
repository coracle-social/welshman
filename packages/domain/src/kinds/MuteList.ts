import {uniq, nthEq} from "@welshman/lib"
import {MUTES, getPubkeyTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10000 mute list.
export class MuteList extends ListReader {
  readonly kind = MUTES

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    return new MuteListBuilder(this)
  }
}

export class MuteListBuilder extends ListBuilder<MuteList> {
  readonly kind = MUTES

  mutePublicly(pubkey: string) {
    return this.addPublic(["p", pubkey])
  }

  mutePrivately(pubkey: string) {
    return this.addPrivate(["p", pubkey])
  }

  unmute(pubkey: string) {
    return this.drop(nthEq(1, pubkey))
  }
}
