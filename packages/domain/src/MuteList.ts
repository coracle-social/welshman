import {uniq} from "@welshman/lib"
import {MUTES, getPubkeyTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10000 mute list. Pubkeys can be muted publicly (tags) or privately
// (encrypted content); the accessors treat both as one merged set.
export class MuteList extends EncryptableList {
  readonly kind = MUTES

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  mutePublicly(pubkey: string) {
    return this.addPublicTags(["p", pubkey])
  }

  mutePrivately(pubkey: string) {
    return this.addPrivateTags(["p", pubkey])
  }

  unmute(pubkey: string) {
    return this.removeTagsWithValue(pubkey)
  }
}
