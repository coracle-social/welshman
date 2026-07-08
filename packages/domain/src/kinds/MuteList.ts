import {uniq, spec} from "@welshman/lib"
import {MUTES, getPubkeyTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

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

export class MuteListBuilder extends ListBuilder<MuteListReader> {
  readonly kind = MUTES

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

export const MuteList = new Kind({
  reader: MuteListReader,
  builder: MuteListBuilder,
  router: OutboxRouter,
})
