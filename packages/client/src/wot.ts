import {derived, writable} from "svelte/store"
import type {Readable, Writable} from "svelte/store"
import {max, throttle, addToMapKey, inc, dec} from "@welshman/lib"
import {getListTags, getPubkeyTagValues} from "@welshman/util"
import {throttled, getter} from "@welshman/store"
import type {IClient} from "./client.js"
import {FollowLists} from "./follows.js"
import {MuteLists} from "./mutes.js"

/**
 * Web-of-trust scoring derived from follow and mute lists. The trust graph is
 * built from the perspective of the client's user (or, with no user, the union
 * of every known follow list) and updated reactively as lists change.
 */
export class Wot {
  followersByPubkey: Readable<Map<string, Set<string>>>
  mutersByPubkey: Readable<Map<string, Set<string>>>
  wotGraph: Writable<Map<string, number>>
  maxWot: Readable<number | undefined>

  private getFollowersByPubkeyStore: () => Map<string, Set<string>>
  private getMutersByPubkeyStore: () => Map<string, Set<string>>
  private getWotGraphStore: () => Map<string, number>
  private getMaxWotStore: () => number | undefined

  constructor(readonly ctx: IClient) {
    const followLists = this.ctx.use(FollowLists)
    const muteLists = this.ctx.use(MuteLists)

    this.followersByPubkey = derived(throttled(1000, followLists.all), lists => {
      const $followersByPubkey = new Map<string, Set<string>>()

      for (const list of lists) {
        for (const pubkey of getPubkeyTagValues(getListTags(list))) {
          addToMapKey($followersByPubkey, pubkey, list.event.pubkey)
        }
      }

      return $followersByPubkey
    })

    this.mutersByPubkey = derived(throttled(1000, muteLists.all), lists => {
      const $mutersByPubkey = new Map<string, Set<string>>()

      for (const list of lists) {
        for (const pubkey of getPubkeyTagValues(getListTags(list))) {
          addToMapKey($mutersByPubkey, pubkey, list.event.pubkey)
        }
      }

      return $mutersByPubkey
    })

    this.wotGraph = writable(new Map<string, number>())

    this.maxWot = derived(this.wotGraph, $g => max(Array.from($g.values())))

    this.getFollowersByPubkeyStore = getter(this.followersByPubkey)
    this.getMutersByPubkeyStore = getter(this.mutersByPubkey)
    this.getWotGraphStore = getter(this.wotGraph)
    this.getMaxWotStore = getter(this.maxWot)

    followLists.subscribe(this.buildGraph)
    muteLists.subscribe(this.buildGraph)
  }

  getFollows = (pubkey: string) =>
    getPubkeyTagValues(getListTags(this.ctx.use(FollowLists).get(pubkey)))

  getMutes = (pubkey: string) =>
    getPubkeyTagValues(getListTags(this.ctx.use(MuteLists).get(pubkey)))

  getNetwork = (pubkey: string) => {
    const pubkeys = new Set(this.getFollows(pubkey))
    const network = new Set<string>()

    for (const follow of pubkeys) {
      for (const tpk of this.getFollows(follow)) {
        if (!pubkeys.has(tpk)) {
          network.add(tpk)
        }
      }
    }

    return Array.from(network)
  }

  getFollowersByPubkey = () => this.getFollowersByPubkeyStore()

  getMutersByPubkey = () => this.getMutersByPubkeyStore()

  getFollowers = (pubkey: string) => Array.from(this.getFollowersByPubkey().get(pubkey) || [])

  getMuters = (pubkey: string) => Array.from(this.getMutersByPubkey().get(pubkey) || [])

  getFollowsWhoFollow = (pubkey: string, target: string) =>
    this.getFollows(pubkey).filter(other => this.getFollows(other).includes(target))

  getFollowsWhoMute = (pubkey: string, target: string) =>
    this.getFollows(pubkey).filter(other => this.getMutes(other).includes(target))

  getWotGraph = () => this.getWotGraphStore()

  getMaxWot = () => this.getMaxWotStore()

  buildGraph = throttle(1000, () => {
    const $pubkey = this.ctx.user?.pubkey
    const $graph = new Map<string, number>()
    const $follows = $pubkey
      ? this.getFollows($pubkey)
      : Array.from(this.ctx.use(FollowLists).keys())

    for (const follow of $follows) {
      for (const pubkey of this.getFollows(follow)) {
        $graph.set(pubkey, inc($graph.get(pubkey)))
      }

      for (const pubkey of this.getMutes(follow)) {
        $graph.set(pubkey, dec($graph.get(pubkey)))
      }
    }

    this.wotGraph.set($graph)
  })

  getWotScore = (pubkey: string, target: string) => {
    const follows = pubkey ? this.getFollowsWhoFollow(pubkey, target) : this.getFollowers(target)
    const mutes = pubkey ? this.getFollowsWhoMute(pubkey, target) : this.getMuters(target)

    return follows.length - mutes.length
  }
}
