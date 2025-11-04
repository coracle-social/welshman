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
import {Router} from "@welshman/router"
import {displayProfileByPubkey} from "./profiles.js"
import {pubkey} from "./session.js"

export const tagZapSplit = (pubkey: string, split = 1) => [
  "zap",
  pubkey,
  Router.get().FromPubkey(pubkey).getUrl() || "",
  String(split),
]

export const tagPubkey = (pubkey: string, ...args: unknown[]) => [
  "p",
  pubkey,
  Router.get().FromPubkey(pubkey).getUrl() || "",
  displayProfileByPubkey(pubkey),
]

export const tagEvent = (event: TrustedEvent, mark = "") => {
  const url = Router.get().Event(event).getUrl() || ""
  const tags = [["e", event.id, url, mark, event.pubkey]]

  if (isReplaceable(event)) {
    tags.push(["a", getAddress(event), url, mark, event.pubkey])
  }

  return tags
}

export const tagEventPubkeys = (event: TrustedEvent) =>
  uniq(remove(pubkey.get()!, [event.pubkey, ...getPubkeyTagValues(event.tags)])).map(tagPubkey)

export const tagEventForQuote = (event: TrustedEvent) => [
  "q",
  event.id,
  Router.get().Event(event).getUrl() || "",
  event.pubkey,
]

export const tagEventForReply = (event: TrustedEvent) => {
  const tags = tagEventPubkeys(event)
  const {roots, replies} = getReplyTags(event.tags)
  const parents = roots.length > 0 ? roots : replies
  const mark = parents.length > 0 ? "reply" : "root"
  const hint = Router.get().Event(event).getUrl() || ""

  // If the parent included roots use them, otherwise use replies as a fallback
  for (const [k, id, originalHint = "", _, pubkey = ""] of parents) {
    const hint = isShareableRelayUrl(originalHint)
      ? originalHint
      : Router.get().EventRoots(event).getUrl()

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

export const tagEventForComment = (event: TrustedEvent) => {
  const pubkeyHint = Router.get().FromPubkey(event.pubkey).getUrl() || ""
  const eventHint = Router.get().Event(event).getUrl() || ""
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

export const tagEventForReaction = (event: TrustedEvent) => {
  const hint = Router.get().Event(event).getUrl() || ""
  const tags: string[][] = []

  // Mention the event's author
  if (event.pubkey !== pubkey.get()) {
    tags.push(tagPubkey(event.pubkey))
  }

  tags.push(["k", String(event.kind)])
  tags.push(["e", event.id, hint])

  if (isReplaceable(event)) {
    tags.push(["a", getAddress(event), hint])
  }

  return tags
}
