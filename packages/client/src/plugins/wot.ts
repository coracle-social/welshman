import {readable, derived} from "svelte/store"
import {max, throttle, addToMapKey, inc, dec} from "@welshman/lib"
import {getListTags, getPubkeyTagValues} from "@welshman/util"
import type {List} from "@welshman/util"
import type {IClient} from "../client.js"
import {projection, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {FollowLists} from "./follows.js"
import {MuteLists} from "./mutes.js"

const listPubkeys = (list: List | undefined) => getPubkeyTagValues(getListTags(list))

/**
 * Web-of-trust scoring derived from follow and mute lists. The trust graph is
 * built from the perspective of the client's user (or, with no user, the union
 * of every known follow list) and updated reactively as lists change.
 *
 * The aggregate `*ByPubkey`/`graph`/`max` fields and the parameterized methods
 * (`follows`, `wotScore`, …) are all `Projection`s — subscribe via `.$`, snapshot
 * via `.get()`.
 */
export class Wot {
  followersByPubkey: Projection<Map<string, Set<string>>>
  mutersByPubkey: Projection<Map<string, Set<string>>>
  graph: Projection<Map<string, number>>
  max: Projection<number | undefined>

  constructor(readonly ctx: IClient) {
    const followersByPubkeyStore = readable(new Map<string, Set<string>>(), set =>
      this.ctx.use(FollowLists).index.$.subscribe(
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
    )

    const mutersByPubkeyStore = readable(new Map<string, Set<string>>(), set =>
      this.ctx.use(MuteLists).index.$.subscribe(
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
    )

    const graphStore = readable(new Map<string, number>(), set => {
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
        this.ctx.use(FollowLists).index.$.subscribe(rebuild),
        this.ctx.use(MuteLists).index.$.subscribe(rebuild),
      ]

      return () => unsubscribers.forEach(unsubscribe => unsubscribe())
    })

    const maxStore = derived(graphStore, $g => max(Array.from($g.values())))

    this.followersByPubkey = projection(followersByPubkeyStore)
    this.mutersByPubkey = projection(mutersByPubkeyStore)
    this.graph = projection(graphStore)
    this.max = projection(maxStore)
  }

  follows = (pubkey: string): Projection<string[]> =>
    projectFrom(this.ctx.use(FollowLists).index, $lists => listPubkeys($lists.get(pubkey)))

  mutes = (pubkey: string): Projection<string[]> =>
    projectFrom(this.ctx.use(MuteLists).index, $lists => listPubkeys($lists.get(pubkey)))

  network = (pubkey: string): Projection<string[]> =>
    projectFrom(this.ctx.use(FollowLists).index, $lists => {
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

  followers = (pubkey: string): Projection<string[]> =>
    projectFrom(this.followersByPubkey, $followers => Array.from($followers.get(pubkey) || []))

  muters = (pubkey: string): Projection<string[]> =>
    projectFrom(this.mutersByPubkey, $muters => Array.from($muters.get(pubkey) || []))

  followsWhoFollow = (pubkey: string, target: string): Projection<string[]> =>
    projectFrom(this.ctx.use(FollowLists).index, $lists =>
      listPubkeys($lists.get(pubkey)).filter(other =>
        listPubkeys($lists.get(other)).includes(target),
      ),
    )

  followsWhoMute = (pubkey: string, target: string): Projection<string[]> => {
    const read = ($follows: ReadonlyMap<string, List>, $mutes: ReadonlyMap<string, List>) =>
      listPubkeys($follows.get(pubkey)).filter(other =>
        listPubkeys($mutes.get(other)).includes(target),
      )

    return projection(
      derived(
        [this.ctx.use(FollowLists).index.$, this.ctx.use(MuteLists).index.$],
        ([$follows, $mutes]) => read($follows, $mutes),
      ),
      () => read(this.ctx.use(FollowLists).index.get(), this.ctx.use(MuteLists).index.get()),
    )
  }

  wotScore = (pubkey: string, target: string): Projection<number> => {
    const read = (
      $follows: ReadonlyMap<string, List>,
      $mutes: ReadonlyMap<string, List>,
      $followers: ReadonlyMap<string, Set<string>>,
      $muters: ReadonlyMap<string, Set<string>>,
    ) => {
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
    }

    return projection(
      derived(
        [
          this.ctx.use(FollowLists).index.$,
          this.ctx.use(MuteLists).index.$,
          this.followersByPubkey.$,
          this.mutersByPubkey.$,
        ],
        ([$follows, $mutes, $followers, $muters]) => read($follows, $mutes, $followers, $muters),
      ),
      () =>
        read(
          this.ctx.use(FollowLists).index.get(),
          this.ctx.use(MuteLists).index.get(),
          this.followersByPubkey.get(),
          this.mutersByPubkey.get(),
        ),
    )
  }
}
