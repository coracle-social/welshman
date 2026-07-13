import {uniq} from "@welshman/lib"
import {
  DELETE,
  getEventTagValues,
  getAddressTagValues,
  getKindTagValues,
  getAddress,
  isReplaceable,
  seen,
  outbox,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {hint} from "../Hint.js"
import {KindFactory} from "../Kind.js"

// NIP-09 kind-5 delete request.
export class DeleteReader extends EventReader {
  readonly kind = DELETE

  ids() {
    return uniq(getEventTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  kinds() {
    return uniq(getKindTagValues(this.tags()))
  }

  reason() {
    return this.content()
  }
}

export class DeleteWriter extends EventWriter<DeleteReader> {
  readonly kind = DELETE

  // The default (author outbox + mentions) plus every relay each deleted event was
  // found on, so the delete reaches wherever those events live.
  protected async routes() {
    const tags = await this.getTags()

    return [
      ...(await super.routes()),
      ...uniq(getEventTagValues(tags)).map(id => seen({id})),
    ]
  }

  addEvent(event: TrustedEvent) {
    this.addTags(["e", event.id, hint(outbox(event.pubkey))], ["k", String(event.kind)])

    if (isReplaceable(event)) {
      this.addTags(["a", getAddress(event), hint(outbox(event.pubkey))])
    }

    return this
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }

  protected validate() {
    super.validate()

    if (!this.extraTags.some(t => ["e", "a"].includes(t[0] as string))) {
      throw new Error("A delete must reference at least one event via an e or a tag")
    }
  }
}

export const Delete = new KindFactory({
  reader: DeleteReader,
  writer: DeleteWriter,
})
