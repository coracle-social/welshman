import {uniq} from "@welshman/lib"
import {MUTES, getPubkeyTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10000 mute list. Pubkeys can be muted publicly (tags) or privately
// (encrypted content); the reader treats both as one merged set.
export class MuteList extends ListReader {
  static kind = MUTES

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    return this.seedList(new MuteListBuilder())
  }
}

export class MuteListBuilder extends ListBuilder {
  static kind = MUTES

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
