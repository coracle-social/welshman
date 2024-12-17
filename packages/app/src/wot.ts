import {derived, writable} from "svelte/store"
import {max, throttle, addToMapKey, inc, dec} from "@welshman/lib"
import {getListTags, getPubkeyTagValues} from "@welshman/util"
import {throttled, withGetter} from "@welshman/store"
import {pubkey} from "./session.js"
import {follows, followsByPubkey} from "./follows.js"
import {mutes, mutesByPubkey} from "./mutes.js"

export const getFollows = (pubkey: string) =>
  getPubkeyTagValues(getListTags(followsByPubkey.get().get(pubkey)))

export const getMutes = (pubkey: string) =>
  getPubkeyTagValues(getListTags(mutesByPubkey.get().get(pubkey)))

export const getNetwork = (pubkey: string) => {
  const pubkeys = new Set(getFollows(pubkey))
  const network = new Set<string>()

  for (const follow of pubkeys) {
    for (const tpk of getFollows(follow)) {
      if (!pubkeys.has(tpk)) {
        network.add(tpk)
      }
    }
  }

  return Array.from(network)
}

export const followersByPubkey = withGetter(
  derived(throttled(1000, follows), lists => {
    const $followersByPubkey = new Map<string, Set<string>>()

    for (const list of lists) {
      for (const pubkey of getPubkeyTagValues(getListTags(list))) {
        addToMapKey($followersByPubkey, pubkey, list.event.pubkey)
      }
    }

    return $followersByPubkey
  }),
)

export const mutersByPubkey = withGetter(
  derived(throttled(1000, mutes), lists => {
    const $mutersByPubkey = new Map<string, Set<string>>()

    for (const list of lists) {
      for (const pubkey of getPubkeyTagValues(getListTags(list))) {
        addToMapKey($mutersByPubkey, pubkey, list.event.pubkey)
      }
    }

    return $mutersByPubkey
  }),
)

export const getFollowers = (pubkey: string) =>
  Array.from(followersByPubkey.get().get(pubkey) || [])

export const getMuters = (pubkey: string) => Array.from(mutersByPubkey.get().get(pubkey) || [])

export const getFollowsWhoFollow = (pubkey: string, target: string) =>
  getFollows(pubkey).filter(other => getFollows(other).includes(target))

export const getFollowsWhoMute = (pubkey: string, target: string) =>
  getFollows(pubkey).filter(other => getMutes(other).includes(target))

export const wotGraph = withGetter(writable(new Map<string, number>()))

export const maxWot = withGetter(derived(wotGraph, $g => max(Array.from($g.values()))))

const buildGraph = throttle(1000, () => {
  const $pubkey = pubkey.get()
  const $graph = new Map<string, number>()
  const $follows = $pubkey ? getFollows($pubkey) : followsByPubkey.get().keys()

  for (const follow of $follows) {
    for (const pubkey of getFollows(follow)) {
      $graph.set(pubkey, inc($graph.get(pubkey)))
    }

    for (const pubkey of getMutes(follow)) {
      $graph.set(pubkey, dec($graph.get(pubkey)))
    }
  }

  wotGraph.set($graph)
})

pubkey.subscribe(buildGraph)
follows.subscribe(buildGraph)
mutes.subscribe(buildGraph)

export const getWotScore = (pubkey: string, target: string) => {
  const follows = pubkey ? getFollowsWhoFollow(pubkey, target) : getFollowers(target)
  const mutes = pubkey ? getFollowsWhoMute(pubkey, target) : getMuters(target)

  return follows.length - mutes.length
}
