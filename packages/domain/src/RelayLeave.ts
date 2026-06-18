import {RELAY_LEAVE} from "@welshman/util"
import type {EventTemplate} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RelayLeaveValues = {}

export const makeRelayLeaveValues = (values: Partial<RelayLeaveValues> = {}): RelayLeaveValues => ({
  ...values,
})

// Ephemeral kind-28936 relay/space leave marker, the counterpart to RelayJoin.
// Carries no tags and no content; flotilla both emits it (the leave flow) and
// consumes it to reset the space membership state machine (RELAY_LEAVE ->
// Initial). State-free, so it extends DomainObject directly.
export class RelayLeave extends DomainObject<RelayLeaveValues> {
  readonly kind = RELAY_LEAVE
  values = makeRelayLeaveValues()

  protected normalizeValues(values: Partial<RelayLeaveValues> = {}) {
    return makeRelayLeaveValues(values)
  }

  protected parseEvent(): Partial<RelayLeaveValues> {
    return {}
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: [],
      content: "",
    }
  }
}
