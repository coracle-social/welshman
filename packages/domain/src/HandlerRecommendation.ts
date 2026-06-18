import {last} from "@welshman/lib"
import {HANDLER_RECOMMENDATION, getIdentifier, getAddressTags, getAddressTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type HandlerRecommendationValues = {
  // The recommended kind, stored in the `d` tag.
  identifier: string
  // Raw `a` tags: ["a", address, relay?, platform?].
  addresses: string[][]
}

export const makeHandlerRecommendationValues = (
  values: Partial<HandlerRecommendationValues> = {},
): HandlerRecommendationValues => ({
  identifier: "",
  addresses: [],
  ...values,
})

// NIP-89 kind-31989 handler recommendation. Addressable (the `d` tag holds the
// recommended kind), tags-only with empty content. Each entry is a raw `a` tag
// pointing at a kind-31990 handler, optionally carrying a relay hint and a
// trailing platform marker (e.g. "web").
export class HandlerRecommendation extends DomainObject<HandlerRecommendationValues> {
  readonly kind = HANDLER_RECOMMENDATION
  values = makeHandlerRecommendationValues()

  protected normalizeValues(values: Partial<HandlerRecommendationValues> = {}) {
    return makeHandlerRecommendationValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<HandlerRecommendationValues> {
    return {
      identifier: getIdentifier(event) || "",
      addresses: getAddressTags(event.tags),
    }
  }

  identifier() {
    return this.values.identifier
  }

  addresses() {
    return getAddressTagValues(this.values.addresses)
  }

  // Prefer the recommendation marked as a "web" handler, otherwise fall back to
  // the first recommendation.
  handlerAddress() {
    const tag = this.values.addresses.find(t => last(t) === "web") || this.values.addresses[0]

    return tag?.[1]
  }

  addRecommendation(address: string, relay?: string, platform?: string) {
    if (!this.values.addresses.some(t => t[1] === address)) {
      this.values.addresses = [
        ...this.values.addresses,
        ["a", address, relay || "", platform || ""],
      ]
    }

    return this
  }

  removeRecommendation(address: string) {
    this.values.addresses = this.values.addresses.filter(t => t[1] !== address)

    return this
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: [["d", this.values.identifier], ...this.values.addresses],
      content: "",
    }
  }
}
