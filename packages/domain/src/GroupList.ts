import {uniq} from "@welshman/lib"
import {COMMUNITIES, getAddressTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10004 group (community) membership list. Entries are `a` tags
// pointing at kind-34550 community definitions, merged across public tags and
// decrypted private content.
export class GroupList extends ListReader {
  static kind = COMMUNITIES

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  builder() {
    return this.seedList(new GroupListBuilder())
  }
}

export class GroupListBuilder extends ListBuilder {
  static kind = COMMUNITIES

  addGroup(address: string, relayHint?: string) {
    return this.addPublicTags(["a", address, relayHint || ""])
  }

  removeGroup(address: string) {
    return this.removeTagsWithValue(address)
  }
}
