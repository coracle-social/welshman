import {uniq} from "@welshman/lib"
import {
  DELETE,
  getEventTagValues,
  getAddressTagValues,
  getKindTagValues,
  getAddress,
  isReplaceable,
  seen,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {EventRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

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

// Author outbox + mentions, plus every relay each deleted event was found on, so
// the delete reaches wherever those events live.
export class DeleteRouter extends EventRouter {
  async routes() {
    const group = this.groupRoutes()

    if (group) return group

    const tags = await this.getTags()

    return [
      this.authorRoute(),
      ...this.mentionRoutes(tags),
      ...uniq(getEventTagValues(tags)).map(id => seen({id})),
    ]
  }
}

export class DeleteBuilder extends EventBuilder<DeleteReader> {
  readonly kind = DELETE

  addEvent(event: TrustedEvent) {
    this.addTags(["e", event.id], ["k", String(event.kind)])

    if (isReplaceable(event)) {
      this.addTags(["a", getAddress(event)])
    }

    return this
  }

  setReason(reason: string) {
    return this.setContent(reason)
  }

  protected validate() {
    super.validate()

    if (!this.extraTags.some(t => ["e", "a"].includes(t[0]))) {
      throw new Error("A delete must reference at least one event via an e or a tag")
    }
  }
}

export const Delete = new Kind({
  reader: DeleteReader,
  builder: DeleteBuilder,
  router: DeleteRouter,
})
