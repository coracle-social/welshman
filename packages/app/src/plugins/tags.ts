import {uniq, remove, nth} from "@welshman/lib"
import {
  getAddress,
  isReplaceable,
  getReplyTags,
  getAncestorTags,
  getPubkeyTags,
  getPubkeyTagValues,
  isReplaceableKind,
  isRelayUrl,
  isShareableRelayUrl,
  outbox,
  relayHints,
} from "@welshman/util"
import type {TrustedEvent, RelaySelection} from "@welshman/util"
import {Router} from "./router.js"
import {Profiles} from "./profiles.js"
import type {IApp} from "../app.js"

/**
 * Builders for nostr tags (p/e/a/q/zap/reply/comment/reaction). Relay hints are
 * resolved through the router's declarative selection API, so these methods are
 * async. The profiles collection supplies display names, and the app's user is
 * used to avoid self-tagging.
 */
export class Tags {
  constructor(readonly app: IApp) {}

  // A single best relay url for the given selections (the empty string when none).
  private hint = async (selections: RelaySelection[]) => {
    const scenario = await this.app.use(Router).resolve(selections)

    return scenario.getUrl() || ""
  }

  // Where to find a pubkey's events — their outbox.
  private pubkeyHint = (pubkey: string) => this.hint([outbox(pubkey)])

  // Where to find an event — its author's outbox.
  private eventHint = (event: TrustedEvent) => this.hint([outbox(event.pubkey)])

  // A hint for an event's thread roots: the root authors' outboxes (weighted up),
  // any mentioned pubkeys' outboxes, and relay hints carried on those tags.
  private eventRootsHint = (event: TrustedEvent) => {
    const {roots} = getAncestorTags(event)
    const mentions = getPubkeyTags(event.tags)
    const authors = roots.map(nth(3)).filter(p => p?.length === 64)
    const others = mentions.map(nth(1)).filter(p => p?.length === 64)
    const relays = uniq([...roots, ...mentions].map(nth(2)).filter(r => r && isRelayUrl(r)))

    return this.hint([
      ...authors.map(pubkey => outbox(pubkey, 10)),
      ...others.map(pubkey => outbox(pubkey)),
      ...relayHints(relays),
    ])
  }

  tagZapSplit = async (pubkey: string, split = 1) => [
    "zap",
    pubkey,
    await this.pubkeyHint(pubkey),
    String(split),
  ]

  tagPubkey = async (pubkey: string) => [
    "p",
    pubkey,
    await this.pubkeyHint(pubkey),
    this.app.use(Profiles).display(pubkey).get(),
  ]

  tagEvent = async (event: TrustedEvent, url = "", mark = "") => {
    if (!url) {
      url = await this.eventHint(event)
    }

    const tags = [["e", event.id, url, mark, event.pubkey]]

    if (isReplaceable(event)) {
      tags.push(["a", getAddress(event), url, mark, event.pubkey])
    }

    return tags
  }

  tagEventPubkeys = (event: TrustedEvent) =>
    Promise.all(
      uniq(
        remove(this.app.user?.pubkey ?? "", [event.pubkey, ...getPubkeyTagValues(event.tags)]),
      ).map(pubkey => this.tagPubkey(pubkey)),
    )

  tagEventForQuote = async (event: TrustedEvent, relay?: string) => {
    const hint = relay || (await this.eventHint(event))

    return ["q", event.id, hint, event.pubkey]
  }

  tagEventForReply = async (event: TrustedEvent, relay?: string) => {
    const tags = await this.tagEventPubkeys(event)
    const {roots, replies} = getReplyTags(event.tags)
    const parents = roots.length > 0 ? roots : replies
    const mark = parents.length > 0 ? "reply" : "root"
    const hint = relay || (await this.eventHint(event))

    // If the parent included roots use them, otherwise use replies as a fallback
    for (const [k, id, originalHint = "", _, pubkey = ""] of parents) {
      const rootHint = isShareableRelayUrl(originalHint)
        ? originalHint
        : await this.eventRootsHint(event)

      tags.push([k, id, rootHint || "", "root", pubkey])
    }

    // e-tag the event
    tags.push(["e", event.id, hint, mark, event.pubkey])

    // a-tag the event
    if (isReplaceable(event)) {
      tags.push(["a", getAddress(event), hint, mark, event.pubkey])
    }

    return tags
  }

  tagEventForComment = async (event: TrustedEvent, relay?: string) => {
    const pubkeyHint = await this.pubkeyHint(event.pubkey)
    const eventHint = relay || (await this.eventHint(event))
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

  tagEventForReaction = async (event: TrustedEvent, relay?: string) => {
    const hint = relay || (await this.eventHint(event))
    const tags: string[][] = []

    // Mention the event's author
    if (event.pubkey !== this.app.user?.pubkey) {
      tags.push(await this.tagPubkey(event.pubkey))
    }

    tags.push(["k", String(event.kind)])
    tags.push(["e", event.id, hint])

    if (isReplaceable(event)) {
      tags.push(["a", getAddress(event), hint])
    }

    return tags
  }
}
