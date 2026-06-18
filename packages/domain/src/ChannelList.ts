import {uniq} from "@welshman/lib"
import {CHANNELS, getEventTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10005 public chat channel list. Entries are `e` tags pointing at
// NIP-28 kind-40 channel-create events.
export class ChannelList extends EncryptableList {
  readonly kind = CHANNELS

  ids() {
    return uniq(getEventTagValues(this.tags()))
  }

  add(id: string, relayHint?: string) {
    return this.addPublicTags(["e", id, relayHint || ""])
  }

  remove(id: string) {
    return this.removeTagsWithValue(id)
  }
}
