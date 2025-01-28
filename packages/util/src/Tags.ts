import {uniqBy, mapVals, nth, nthEq, ensurePlural} from "@welshman/lib"
import {isRelayUrl} from "./Relay.js"
import {Address} from "./Address.js"

export const getTags = (types: string | string[], tags: string[][]) => {
  types = ensurePlural(types)

  return tags.filter(t => types.includes(t[0]))
}

export const getTag = (types: string | string[], tags: string[][]) => {
  types = ensurePlural(types)

  return tags.find(t => types.includes(t[0]))
}

export const getTagValues = (types: string | string[], tags: string[][]) =>
  getTags(types, tags).map(nth(1))

export const getTagValue = (types: string | string[], tags: string[][]) => getTag(types, tags)?.[1]

export const getEventTags = (tags: string[][]) =>
  tags.filter(t => ["e"].includes(t[0]) && t[1].length === 64)

export const getEventTagValues = (tags: string[][]) => getEventTags(tags).map(nth(1))

export const getAddressTags = (tags: string[][]) =>
  tags.filter(t => ["a"].includes(t[0]) && Address.isAddress(t[1]))

export const getAddressTagValues = (tags: string[][]) => getAddressTags(tags).map(nth(1))

export const getPubkeyTags = (tags: string[][]) =>
  tags.filter(t => ["p"].includes(t[0]) && t[1].length === 64)

export const getPubkeyTagValues = (tags: string[][]) => getPubkeyTags(tags).map(nth(1))

export const getTopicTags = (tags: string[][]) => tags.filter(nthEq(0, "t"))

export const getTopicTagValues = (tags: string[][]) =>
  getTopicTags(tags).map(t => t[1].replace(/^#/, ""))

export const getRelayTags = (tags: string[][]) =>
  tags.filter(t => ["r", "relay"].includes(t[0]) && isRelayUrl(t[1] || ""))

export const getRelayTagValues = (tags: string[][]) => getRelayTags(tags).map(nth(1))

export const getGroupTags = (tags: string[][]) =>
  tags.filter(t => ["h", "group"].includes(t[0]) && t[1] && isRelayUrl(t[2] || ""))

export const getGroupTagValues = (tags: string[][]) => getGroupTags(tags).map(nth(1))

export const getKindTags = (tags: string[][]) =>
  tags.filter(t => ["k"].includes(t[0]) && t[1].match(/^\d+$/))

export const getKindTagValues = (tags: string[][]) => getKindTags(tags).map(t => parseInt(t[1]))

export const getCommentTags = (tags: string[][]) => {
  const roots = tags.filter(t => ["A", "E", "P", "K"].includes(t[0]))
  const replies = tags.filter(t => ["a", "e", "p", "k"].includes(t[0]))

  return {roots, replies}
}

export const getCommentTagValues = (tags: string[][]) =>
  mapVals(tags => tags.map(nth(1)), getCommentTags(tags))

export const getReplyTags = (tags: string[][]) => {
  const validTags = tags.filter(t => ["a", "e", "q"].includes(t[0]))
  const mentionTags = validTags.filter(nthEq(0, "q"))
  const roots: string[][] = []
  const replies: string[][] = []
  const mentions: string[][] = []

  const dispatchTags = (thisTags: string[][]) =>
    thisTags.forEach((t: string[], i: number) => {
      if (t[3] === "root") {
        if (validTags.filter(nthEq(3, "reply")).length === 0) {
          replies.push(t)
        } else {
          roots.push(t)
        }
      } else if (t[3] === "reply") {
        replies.push(t)
      } else if (t[3] === "mention") {
        mentions.push(t)
      } else if (i === thisTags.length - 1) {
        replies.push(t)
      } else if (i === 0) {
        roots.push(t)
      } else {
        mentions.push(t)
      }
    })

  // Add different types separately so positional logic works
  dispatchTags(validTags.filter(nthEq(0, "e")))
  dispatchTags(validTags.filter(nthEq(0, "a")).filter(t => Boolean(t[3])))
  mentionTags.forEach((t: string[]) => mentions.push(t))

  return {roots, replies, mentions}
}

export const getReplyTagValues = (tags: string[][]) =>
  mapVals(tags => tags.map(nth(1)), getReplyTags(tags))

export const uniqTags = (tags: string[][]) => uniqBy(t => t.slice(0, 2).join(":"), tags)

export const tagsFromIMeta = (imeta: string[]) => imeta.map((m: string) => m.split(" "))
