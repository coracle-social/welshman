import {uniq, spec, removeUndefined} from "@welshman/lib"
import {COMMUNITIES, addressTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10004 community list — the NIP-72 moderated communities the user
// follows, as `a` tags. Distinct from RoomList (10009), which tracks NIP-29 rooms.
export class CommunityListReader extends EventReader {
  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }
}

export class CommunityListWriter extends EventWriter<CommunityListReader> {
  addCommunity(address: string, relayHint?: string) {
    return this.addTags(removeUndefined(["a", address, relayHint]))
  }

  removeCommunity(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}

export const CommunityList = new KindFactory({
  kind: COMMUNITIES,
  reader: CommunityListReader,
  writer: CommunityListWriter,
})
