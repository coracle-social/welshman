import {readable, derived} from "svelte/store"
import {max, throttle, addToMapKey, inc, dec} from "@welshman/lib"
import {getListTags, getPubkeyTagValues} from "@welshman/util"
import type {List} from "@welshman/util"
import {withGetter} from "@welshman/store"
import type {ReadableWithGetter} from "@welshman/store"
import type {IClient} from "./client.js"
import {FollowLists} from "./follows.js"
import {MuteLists} from "./mutes.js"

const listPubkeys = (list: List | undefined) => getPubkeyTagValues(getListTags(list))

/**
 * Web-of-trust scoring derived from follow and mute lists. The trust graph is
 * built from the perspective of the client's user (or, with no user, the union
 * of every known follow list) and updated reactively as lists change.
 *
 * The aggregate `*ByPubkey`/`graph`/`max` fields are long-lived `withGetter`
 * stores (snapshot with `.get()`). The parameterized methods (`follows`,
 * `wotScore`, …) return plain on-demand stores — snapshot them with svelte's
 * `get(...)`.
 */
export class Wot {
  followersByPubkey: ReadableWithGetter<Map<string, Set<string>>>
  mutersByPubkey: ReadableWithGetter<Map<string, Set<string>>>
  graph: ReadableWithGetter<Map<string, number>>
  max: ReadableWithGetter<number | undefined>

  constructor(readonly ctx: IClient) {
    this.followersByPubkey = withGetter(
      readable(new Map<string, Set<string>>(), set =>
        this.ctx.use(FollowLists).index.subscribe(
          throttle(1000, lists => {
            const $followersByPubkey = new Map<string, Set<string>>()

            for (const list of lists.values()) {
              for (const pubkey of getPubkeyTagValues(getListTags(list))) {
                addToMapKey($followersByPubkey, pubkey, list.event.pubkey)
              }
            }

            set($followersByPubkey)
          }),
        ),
      ),
    )

    this.mutersByPubkey = withGetter(
      readable(new Map<string, Set<string>>(), set =>
        this.ctx.use(MuteLists).index.subscribe(
          throttle(1000, lists => {
            const $mutersByPubkey = new Map<string, Set<string>>()

            for (const list of lists.values()) {
              for (const pubkey of getPubkeyTagValues(getListTags(list))) {
                addToMapKey($mutersByPubkey, pubkey, list.event.pubkey)
              }
            }

            set($mutersByPubkey)
          }),
        ),
      ),
    )

    this.graph = withGetter(
      readable(new Map<string, number>(), set => {
        const rebuild = throttle(1000, () => {
          const $followLists = this.ctx.use(FollowLists).index.get()
          const $muteLists = this.ctx.use(MuteLists).index.get()
          const $pubkey = this.ctx.user?.pubkey
          const $graph = new Map<string, number>()
          const roots = $pubkey ? listPubkeys($followLists.get($pubkey)) : Array.from($followLists.keys())

          for (const follow of roots) {
            for (const pubkey of listPubkeys($followLists.get(follow))) {
              $graph.set(pubkey, inc($graph.get(pubkey)))
            }

            for (const pubkey of listPubkeys($muteLists.get(follow))) {
              $graph.set(pubkey, dec($graph.get(pubkey)))
            }
          }

          set($graph)
        })

        const unsubscribers = [
          this.ctx.use(FollowLists).index.subscribe(rebuild),
          this.ctx.use(MuteLists).index.subscribe(rebuild),
        ]

        return () => unsubscribers.forEach(unsubscribe => unsubscribe())
      }),
    )

    this.max = withGetter(derived(this.graph, $g => max(Array.from($g.values()))))
  }

  follows = (pubkey: string) =>
    derived(this.ctx.use(FollowLists).index, $lists => listPubkeys($lists.get(pubkey)))

  mutes = (pubkey: string) =>
    derived(this.ctx.use(MuteLists).index, $lists => listPubkeys($lists.get(pubkey)))

  network = (pubkey: string) =>
    derived(this.ctx.use(FollowLists).index, $lists => {
      const pubkeys = new Set(listPubkeys($lists.get(pubkey)))
      const network = new Set<string>()

      for (const follow of pubkeys) {
        for (const tpk of listPubkeys($lists.get(follow))) {
          if (!pubkeys.has(tpk)) {
            network.add(tpk)
          }
        }
      }

      return Array.from(network)
    })

  followers = (pubkey: string) =>
    derived(this.followersByPubkey, $followers => Array.from($followers.get(pubkey) || []))

  muters = (pubkey: string) =>
    derived(this.mutersByPubkey, $muters => Array.from($muters.get(pubkey) || []))

  followsWhoFollow = (pubkey: string, target: string) =>
    derived(this.ctx.use(FollowLists).index, $lists =>
      listPubkeys($lists.get(pubkey)).filter(other =>
        listPubkeys($lists.get(other)).includes(target),
      ),
    )

  followsWhoMute = (pubkey: string, target: string) =>
    derived(
      [this.ctx.use(FollowLists).index, this.ctx.use(MuteLists).index],
      ([$follows, $mutes]) =>
        listPubkeys($follows.get(pubkey)).filter(other =>
          listPubkeys($mutes.get(other)).includes(target),
        ),
    )

  wotScore = (pubkey: string, target: string) =>
    derived(
      [
        this.ctx.use(FollowLists).index,
        this.ctx.use(MuteLists).index,
        this.followersByPubkey,
        this.mutersByPubkey,
      ],
      ([$follows, $mutes, $followers, $muters]) => {
        let follows: string[]
        let mutes: string[]

        if (pubkey) {
          const theirFollows = listPubkeys($follows.get(pubkey))

          follows = theirFollows.filter(other => listPubkeys($follows.get(other)).includes(target))
          mutes = theirFollows.filter(other => listPubkeys($mutes.get(other)).includes(target))
        } else {
          follows = Array.from($followers.get(target) || [])
          mutes = Array.from($muters.get(target) || [])
        }

        return follows.length - mutes.length
      },
    )
}
