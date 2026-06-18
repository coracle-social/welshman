import {uniq, remove} from "@welshman/lib"
import {
  getAddress,
  isReplaceable,
  getReplyTags,
  getPubkeyTagValues,
  isReplaceableKind,
  isShareableRelayUrl,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Router} from "./router.js"
import {Profiles} from "./profiles.js"
import type {IClient} from "../client.js"

/**
 * Builders for nostr tags (p/e/a/q/zap/reply/comment/reaction). Needs the router
 * for relay hints, the profiles collection for display names, and the client's
 * user to avoid self-tagging.
 */
export class Tags {
  constructor(readonly ctx: IClient) {}

  tagZapSplit = (pubkey: string, split = 1) => [
    "zap",
    pubkey,
    this.ctx.use(Router).FromPubkey(pubkey).getUrl() || "",
    String(split),
  ]

  tagPubkey = (pubkey: string) => [
    "p",
    pubkey,
    this.ctx.use(Router).FromPubkey(pubkey).getUrl() || "",
    this.ctx.use(Profiles).display(pubkey).get(),
  ]

  tagEvent = (event: TrustedEvent, url = "", mark = "") => {
    if (!url) {
      url = this.ctx.use(Router).Event(event).getUrl() || ""
    }

    const tags = [["e", event.id, url, mark, event.pubkey]]

    if (isReplaceable(event)) {
      tags.push(["a", getAddress(event), url, mark, event.pubkey])
    }

    return tags
  }

  tagEventPubkeys = (event: TrustedEvent) =>
    uniq(
      remove(this.ctx.user?.pubkey ?? "", [event.pubkey, ...getPubkeyTagValues(event.tags)]),
    ).map(pubkey => this.tagPubkey(pubkey))

  tagEventForQuote = (event: TrustedEvent, relay?: string) => {
    const hint = relay || this.ctx.use(Router).Event(event).getUrl() || ""

    return ["q", event.id, hint, event.pubkey]
  }

  tagEventForReply = (event: TrustedEvent, relay?: string) => {
    const tags = this.tagEventPubkeys(event)
    const {roots, replies} = getReplyTags(event.tags)
    const parents = roots.length > 0 ? roots : replies
    const mark = parents.length > 0 ? "reply" : "root"
    const hint = relay || this.ctx.use(Router).Event(event).getUrl() || ""

    // If the parent included roots use them, otherwise use replies as a fallback
    for (const [k, id, originalHint = "", _, pubkey = ""] of parents) {
      const hint = isShareableRelayUrl(originalHint)
        ? originalHint
        : this.ctx.use(Router).EventRoots(event).getUrl()

      tags.push([k, id, hint || "", "root", pubkey])
    }

    // e-tag the event
    tags.push(["e", event.id, hint, mark, event.pubkey])

    // a-tag the event
    if (isReplaceable(event)) {
      tags.push(["a", getAddress(event), hint, mark, event.pubkey])
    }

    return tags
  }

  tagEventForComment = (event: TrustedEvent, relay?: string) => {
    const pubkeyHint = this.ctx.use(Router).FromPubkey(event.pubkey).getUrl() || ""
    const eventHint = relay || this.ctx.use(Router).Event(event).getUrl() || ""
    const address = getAddress(event)
    const seenRoots = new Set<string>()
    const tags: string[][] = []

    for (const [t, ...tag] of event.tags) {
      if (["K", "E", "A", "I", "P"].includes(t)) {
        tags.push([t, ...tag])
        seenRoots.add(t)
      }
    }

    if (seenRoots.size === 0) {
      tags.push(["K", String(event.kind)])
      tags.push(["P", event.pubkey, pubkeyHint])
      tags.push(["E", event.id, eventHint, event.pubkey])

      if (isReplaceableKind(event.kind)) {
        tags.push(["A", address, eventHint, event.pubkey])
      }
    }

    tags.push(["k", String(event.kind)])
    tags.push(["p", event.pubkey, pubkeyHint])
    tags.push(["e", event.id, eventHint, event.pubkey])

    if (isReplaceableKind(event.kind)) {
      tags.push(["a", address, eventHint, event.pubkey])
    }

    return tags
  }

  tagEventForReaction = (event: TrustedEvent, relay?: string) => {
    const hint = relay || this.ctx.use(Router).Event(event).getUrl() || ""
    const tags: string[][] = []

    // Mention the event's author
    if (event.pubkey !== this.ctx.user?.pubkey) {
      tags.push(this.tagPubkey(event.pubkey))
    }

    tags.push(["k", String(event.kind)])
    tags.push(["e", event.id, hint])

    if (isReplaceable(event)) {
      tags.push(["a", getAddress(event), hint])
    }

    return tags
  }
}
