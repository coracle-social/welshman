import {uniq} from "@welshman/lib"
import {
  DELETE,
  addressTags,
  hexTags,
  kindTags,
  tagSpec,
  tagValue,
  tagValues,
  getAddress,
  isReplaceable,
  seen,
  outbox,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-09 kind-5 delete request.
export class DeleteReader extends EventReader {
  ids() {
    return uniq(tagValues(hexTags("e"), this.tags()))
  }

  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }

  kinds() {
    return uniq(tagValues(kindTags("k"), this.tags()))
  }

  reason() {
    return this.content()
  }
}

export class DeleteWriter extends EventWriter<DeleteReader> {
  // The default (author outbox + mentions) plus every relay each deleted event was
  // found on, so the delete reaches wherever those events live.
  protected async renderRoutes() {
    const tags = await this.renderTags()

    return [
      ...(await super.renderRoutes()),
      ...uniq(tagValues(hexTags("e"), tags)).map(id => seen({id})),
    ]
  }

  addEvent(event: TrustedEvent, roomUrl?: string) {
    const eTag = ["e", event.id, ""]

    this.addTags(eTag, ["k", String(event.kind)])

    this.hint(outbox(event.pubkey)).then(url => {
      eTag[2] = url
    })

    if (isReplaceable(event)) {
      const aTag = ["a", getAddress(event), ""]

      this.addTags(aTag)

      this.hint(outbox(event.pubkey)).then(url => {
        aTag[2] = url
      })
    }

    // If the deleted event was a NIP-29 room event, the delete must carry the
    // same "h" tag and publish to the relay the event lives on (the hint).
    const room = tagValue(tagSpec("h"), event.tags)

    if (room) {
      if (!roomUrl) {
        throw new Error("Deletions of room events must be published to a room url")
      }

      this.setRoom(roomUrl, room)
    }

    return this
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(t => ["e", "a"].includes(t[0] as string))) {
      throw new Error("A delete must reference at least one event via an e or a tag")
    }
  }
}

export class DeleteQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Delete = new KindFactory({
  kind: DELETE,
  reader: DeleteReader,
  writer: DeleteWriter,
  query: DeleteQuery,
})
