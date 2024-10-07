import {ctx} from '@welshman/lib'
import {getAddress, isReplaceable, getAncestorTags, getPubkeyTagValues, getIdAndAddress} from '@welshman/util'
import type {TrustedEvent} from '@welshman/util'
import {displayProfileByPubkey} from './profiles'
import {pubkey} from './session'

export const tagZapSplit = (pubkey: string, split = 1) => [
  "zap",
  pubkey,
  ctx.app.router.FromPubkeys([pubkey]).getUrl(),
  String(split),
]

export const tagPubkey = (pubkey: string, ...args: unknown[]) => [
  "p",
  pubkey,
  ctx.app.router.FromPubkeys([pubkey]).getUrl(),
  displayProfileByPubkey(pubkey),
]

export const tagEvent = (event: TrustedEvent, mark = "") => {
  const url = ctx.app.router.Event(event).getUrl()
  const tags = [["e", event.id, url, mark, event.pubkey]]

  if (isReplaceable(event)) {
    tags.push(["a", getAddress(event), url, mark, event.pubkey])
  }

  return tags
}

export const tagReplyTo = (event: TrustedEvent) => {
  const $pubkey = pubkey.get()
  const tagValues = getIdAndAddress(event)
  const tags: string[][] = []

  // Mention the event's author
  if (event.pubkey !== $pubkey) {
    tags.push(tagPubkey(event.pubkey))
  }

  // Inherit p-tag mentions
  for (const pubkey of getPubkeyTagValues(event.tags)) {
    if (pubkey !== $pubkey) {
      tags.push(tagPubkey(pubkey))
    }
  }

  // Based on NIP 10 legacy tags, order is root, mentions, reply
  const {roots, replies, mentions} = getAncestorTags(event.tags)

  // Root comes first
  if (roots.length > 0) {
    for (const t of roots) {
      tags.push([...t.slice(0, 2), ctx.app.router.EventRoots(event).getUrl(), "root"])
    }
  } else {
    for (const t of replies) {
      tags.push([...t.slice(0, 2), ctx.app.router.EventParents(event).getUrl(), "root"])
    }
  }

  // Make sure we don't repeat any tag values
  const isRepeated = (v: string) => tagValues.includes(v) || tags.find(t => t[1] === v)

  // Inherit mentions
  for (const t of mentions) {
    if (!isRepeated(t[1])) {
      tags.push([...t.slice(0, 3), "mention"])
    }
  }

  // Inherit replies if they weren't already included
  if (roots.length > 0) {
    for (const t of replies) {
      if (!isRepeated(t[1])) {
        tags.push([...t.slice(0, 3), "mention"])
      }
    }
  }

  // Add a/e-tags for the event event
  for (const t of tagEvent(event, replies.length > 0 ? "reply" : "root")) {
    tags.push(t)
  }

  return tags
}

export const tagReactionTo = (event: TrustedEvent) => {
  const tags: string[][] = []

  // Mention the event's author
  if (event.pubkey !== pubkey.get()) {
    tags.push(tagPubkey(event.pubkey))
  }

  // Add a/e-tags for the event
  for (const t of tagEvent(event, "root")) {
    tags.push(t)
  }

  return tags
}



