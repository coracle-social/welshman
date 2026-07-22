import {uniq, spec, removeUndefined} from "@welshman/lib"
import {COMMUNITIES, addressTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10004 group/community list.
export class GroupListReader extends EventReader {
  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }
}

export class GroupListWriter extends EventWriter<GroupListReader> {
  addGroup(address: string, relayHint?: string) {
    return this.addTags(removeUndefined(["a", address, relayHint]))
  }

  removeGroup(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}

export const GroupList = new KindFactory({
  kind: COMMUNITIES,
  reader: GroupListReader,
  writer: GroupListWriter,
})
