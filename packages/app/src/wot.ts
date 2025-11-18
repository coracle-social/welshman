import {derived} from "svelte/store"
import type {Readable, Subscriber} from "svelte/store"
import {max, sub, call, noop, addToMapKey, inc, dec} from "@welshman/lib"
import {getListTags, getPubkeyTagValues, PublishedList} from "@welshman/util"
import {custom, withGetter, deriveIfChanged, NotifierPayload} from "@welshman/store"
import {pubkey} from "./session.js"
import {follows} from "./follows.js"
import {mutes} from "./mutes.js"
import {userFollows} from "./user.js"

export const getFollows = (pubkey: string) => getPubkeyTagValues(getListTags(follows.one(pubkey)))

export const getMutes = (pubkey: string) => getPubkeyTagValues(getListTags(mutes.one(pubkey)))

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

const buildReverseMapping = (store: Readable<NotifierPayload<PublishedList>>) =>
  withGetter(
    custom<Map<string, Set<string>>>(set => {
      const value = new Map()

      return follows.subscribe(payload => {
        payload.handlePut(list => {
          for (const pubkey of getPubkeyTagValues(getListTags(list))) {
            addToMapKey(value, pubkey, list.event.pubkey)
          }
        })

        payload.handlePop(list => {
          for (const pubkey of getPubkeyTagValues(getListTags(list))) {
            const pubkeys = value.get(pubkey)

            pubkeys?.delete(list.event.pubkey)

            if (pubkeys?.size === 0) {
              value.delete(pubkey)
            }
          }
        })

        set(value)
      })
    }),
  )

export const followersByPubkey = buildReverseMapping(follows)

export const mutersByPubkey = buildReverseMapping(mutes)

export const getFollowers = (pubkey: string) => followersByPubkey.get().get(pubkey)

export const getMuters = (pubkey: string) => mutersByPubkey.get().get(pubkey)

export const getFollowsWhoFollow = (pubkey: string, target: string) =>
  getFollows(pubkey).filter(other => getFollows(other).includes(target))

export const getFollowsWhoMute = (pubkey: string, target: string) =>
  getFollows(pubkey).filter(other => getMutes(other).includes(target))

const maintainWotGraph = (set: Subscriber<Map<string, number>>) => {
  const userPubkey = pubkey.get()
  const graph = new Map<string, number>()
  const followedPubkeys = new Set(userPubkey ? getFollows(userPubkey) : [])

  const unsubscribers = [
    follows.subscribe(payload => {
      payload.handlePut(list => {
        if (followedPubkeys.has(list.event.pubkey)) {
          for (const pubkey of getPubkeyTagValues(getListTags(list))) {
            graph.set(pubkey, inc(graph.get(pubkey)))
          }
        }
      })

      payload.handlePop(list => {
        if (followedPubkeys.has(list.event.pubkey)) {
          for (const pubkey of getPubkeyTagValues(getListTags(list))) {
            graph.set(pubkey, dec(graph.get(pubkey)))
          }
        }
      })

      set(graph)
    }),
    mutes.subscribe(payload => {
      payload.handlePut(list => {
        if (followedPubkeys.has(list.event.pubkey)) {
          for (const pubkey of getPubkeyTagValues(getListTags(list))) {
            graph.set(pubkey, dec(graph.get(pubkey)))
          }
        }
      })

      payload.handlePut(list => {
        if (followedPubkeys.has(list.event.pubkey)) {
          for (const pubkey of getPubkeyTagValues(getListTags(list))) {
            graph.set(pubkey, inc(graph.get(pubkey)))
          }
        }
      })

      set(graph)
    }),
  ]

  return () => unsubscribers.forEach(call)
}

export const wotGraph = withGetter(
  custom<Map<string, number>>(set => {
    const unsubscribers = [
      noop,
      userFollows.subscribe(() => {
        unsubscribers[0]()
        unsubscribers[0] = maintainWotGraph(set)
      }),
    ]

    return () => unsubscribers.forEach(call)
  }),
)

export const maxWot = withGetter(derived(wotGraph, $g => max(Array.from($g.values()))))

export const getWotScore = (pubkey: string, target: string) => {
  const follows = pubkey ? getFollowsWhoFollow(pubkey, target).length : getFollowers(target)?.size
  const mutes = pubkey ? getFollowsWhoMute(pubkey, target).length : getMuters(target)?.size

  return sub(follows, mutes)
}

export const getUserWotScore = (target: string) => wotGraph.get().get(target) || 0

export const deriveUserWotScore = (target: string) =>
  deriveIfChanged(wotGraph, $g => $g.get(target))
