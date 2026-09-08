import {RELAY_LEAVE} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// Ephemeral kind-28936 relay/space leave marker.
export class RelayLeaveReader extends EventReader {}

export class RelayLeaveWriter extends EventWriter<RelayLeaveReader> {
  readonly requiresRelays = true

  constructor(kind: number, context: KindContext, reader?: RelayLeaveReader) {
    super(kind, context, reader)

    this.setProtected(true)
  }
}

export class RelayLeaveQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RelayLeave = new KindFactory({
  kind: RELAY_LEAVE,
  reader: RelayLeaveReader,
  writer: RelayLeaveWriter,
  query: RelayLeaveQuery,
})
