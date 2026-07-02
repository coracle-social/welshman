import {uniq} from "@welshman/lib"
import {
  DELETE,
  getEventTagValues,
  getAddressTagValues,
  getKindTagValues,
  getAddress,
  isReplaceable,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-09 kind-5 delete request.
export class Delete extends EventReader {
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

  builder() {
    return new DeleteBuilder(this)
  }
}

export class DeleteBuilder extends EventBuilder<Delete> {
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
