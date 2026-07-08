import {uniq, spec, removeUndefined} from "@welshman/lib"
import {COMMUNITIES, getAddressTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-51 kind-10004 group/community list.
export class GroupListReader extends EventReader {
  readonly kind = COMMUNITIES

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }
}

export class GroupListBuilder extends EventBuilder<GroupListReader> {
  readonly kind = COMMUNITIES

  addGroup(address: string, relayHint?: string) {
    return this.addTags(removeUndefined(["a", address, relayHint]))
  }

  removeGroup(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}

export const GroupList = new Kind({
  reader: GroupListReader,
  builder: GroupListBuilder,
  router: OutboxRouter,
})
