import {spec} from "@welshman/lib"
import {RELAY_JOIN, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// Ephemeral kind-28934 relay/space join request.
export class RelayJoinReader extends EventReader {
  claim() {
    return tagValue(tagSpec("claim"), this.event.tags)
  }

  reason() {
    return this.event.content || undefined
  }
}

export class RelayJoinWriter extends EventWriter<RelayJoinReader> {
  readonly requiresRelays = true

  constructor(kind: number, context: KindContext, reader?: RelayJoinReader) {
    super(kind, context, reader)

    this.setProtected(true)
  }

  setClaim(claim: string) {
    return this.dropTags(spec(["claim"])).addTags(["claim", claim])
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }
}

export class RelayJoinQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RelayJoin = new KindFactory({
  kind: RELAY_JOIN,
  reader: RelayJoinReader,
  writer: RelayJoinWriter,
  query: RelayJoinQuery,
})
