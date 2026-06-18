import {parseJson} from "@welshman/lib"
import {FEED, getIdentifier, getTagValue, getAddress} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type FeedValues = {
  identifier: string
  title: string
  description: string
  // The feed definition is a @welshman/feeds `IFeed` AST. That package is not a
  // dependency of @welshman/domain, so it is typed as `unknown` here.
  definition: unknown
}

export const makeFeedValues = (values: Partial<FeedValues> = {}): FeedValues => ({
  identifier: "",
  title: "",
  description: "",
  definition: undefined,
  ...values,
})

// NIP-51 kind-31890 saved-feed DEFINITION event. Addressable via the "d" tag.
// The feed definition is a @welshman/feeds `IFeed` AST, JSON-encoded in a "feed"
// tag. Content is empty (tags-only, no encryption). This is distinct from the
// kind-10014 FEEDS favorites list (FeedList.ts) which references these by
// address. Flotilla's isTopicFeed/isMentionFeed/isAddressFeed/isContextFeed/
// isPeopleFeed are pure functions over the IFeed AST and stay in flotilla's lib,
// not on this class. Tags-only, so it extends DomainObject directly.
export class Feed extends DomainObject<FeedValues> {
  readonly kind = FEED
  values = makeFeedValues()

  protected normalizeValues(values: Partial<FeedValues> = {}) {
    return makeFeedValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<FeedValues> {
    return {
      identifier: getIdentifier(event) || "",
      title: getTagValue("title", event.tags) || "",
      description: getTagValue("description", event.tags) || "",
      definition: parseJson(getTagValue("feed", event.tags) || ""),
    }
  }

  identifier() {
    return this.values.identifier
  }

  title() {
    return this.values.title
  }

  description() {
    return this.values.description
  }

  definition() {
    return this.values.definition
  }

  display() {
    return this.values.title || "[no name]"
  }

  getAddress() {
    return getAddress(this.event!)
  }

  async toTemplate(): Promise<EventTemplate> {
    const {identifier, title, description, definition} = this.values

    return {
      kind: this.kind,
      content: "",
      tags: [
        ["d", identifier],
        ["alt", title],
        ["title", title],
        ["description", description],
        ["feed", JSON.stringify(definition)],
      ],
    }
  }
}
