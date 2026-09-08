import {spec} from "@welshman/lib"
import {RELAY_INVITE, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-28935 relay invite.
export class RelayInviteReader extends EventReader {
  claim() {
    return tagValue(tagSpec("claim"), this.event.tags)
  }
}

export class RelayInviteWriter extends EventWriter<RelayInviteReader> {
  readonly requiresRelays = true

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }
}

export class RelayInviteQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RelayInvite = new KindFactory({
  kind: RELAY_INVITE,
  reader: RelayInviteReader,
  writer: RelayInviteWriter,
  query: RelayInviteQuery,
})
