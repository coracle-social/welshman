import {readable, derived} from "svelte/store"
import {max, throttle, addToMapKey, inc, dec} from "@welshman/lib"
import type {FollowListReader, MuteListReader} from "@welshman/domain"
import type {IApp} from "../app.js"
import {projection, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {FollowLists} from "./follows.js"
import {MuteLists} from "./mutes.js"

/**
 * Web-of-trust scoring derived from follow and mute lists. The trust graph is
 * built from the perspective of the app's user (or, with no user, the union
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

  constructor(readonly app: IApp) {
    const followersByPubkeyStore = readable(new Map<string, Set<string>>(), set =>
      this.app.use(FollowLists).index.$.subscribe(
        throttle(1000, lists => {
          const $followersByPubkey = new Map<string, Set<string>>()

          for (const list of lists.values()) {
            for (const pubkey of list?.pubkeys() ?? []) {
              addToMapKey($followersByPubkey, pubkey, list.author())
            }
          }

          set($followersByPubkey)
        }),
      ),
    )

    const mutersByPubkeyStore = readable(new Map<string, Set<string>>(), set =>
      this.app.use(MuteLists).index.$.subscribe(
        throttle(1000, lists => {
          const $mutersByPubkey = new Map<string, Set<string>>()

          for (const list of lists.values()) {
            for (const pubkey of list?.pubkeys() ?? []) {
              addToMapKey($mutersByPubkey, pubkey, list.author())
            }
          }

          set($mutersByPubkey)
        }),
      ),
    )

    const graphStore = readable(new Map<string, number>(), set => {
      const rebuild = throttle(1000, () => {
        const $followLists = this.app.use(FollowLists).index.get()
        const $muteLists = this.app.use(MuteLists).index.get()
        const $pubkey = this.app.user?.pubkey
        const $graph = new Map<string, number>()
        const roots = $pubkey
          ? ($followLists.get($pubkey)?.pubkeys() ?? [])
          : Array.from($followLists.keys())

        for (const follow of roots) {
          for (const pubkey of $followLists.get(follow)?.pubkeys() ?? []) {
            $graph.set(pubkey, inc($graph.get(pubkey)))
          }

          for (const pubkey of $muteLists.get(follow)?.pubkeys() ?? []) {
            $graph.set(pubkey, dec($graph.get(pubkey)))
          }
        }

        set($graph)
      })

      const unsubscribers = [
        this.app.use(FollowLists).index.$.subscribe(rebuild),
        this.app.use(MuteLists).index.$.subscribe(rebuild),
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
    projectFrom(this.app.use(FollowLists).index, $lists => $lists.get(pubkey)?.pubkeys() ?? [])

  mutes = (pubkey: string): Projection<string[]> =>
    projectFrom(this.app.use(MuteLists).index, $lists => $lists.get(pubkey)?.pubkeys() ?? [])

  network = (pubkey: string): Projection<string[]> =>
    projectFrom(this.app.use(FollowLists).index, $lists => {
      const pubkeys = new Set($lists.get(pubkey)?.pubkeys() ?? [])
      const network = new Set<string>()

      for (const follow of pubkeys) {
        for (const tpk of $lists.get(follow)?.pubkeys() ?? []) {
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
    projectFrom(this.app.use(FollowLists).index, $lists =>
      ($lists.get(pubkey)?.pubkeys() ?? []).filter(other =>
        ($lists.get(other)?.pubkeys() ?? []).includes(target),
      ),
    )

  followsWhoMute = (pubkey: string, target: string): Projection<string[]> => {
    const read = (
      $follows: ReadonlyMap<string, FollowListReader>,
      $mutes: ReadonlyMap<string, MuteListReader>,
    ) =>
      ($follows.get(pubkey)?.pubkeys() ?? []).filter(other =>
        ($mutes.get(other)?.pubkeys() ?? []).includes(target),
      )

    return projection(
      derived(
        [this.app.use(FollowLists).index.$, this.app.use(MuteLists).index.$],
        ([$follows, $mutes]) => read($follows, $mutes),
      ),
      () => read(this.app.use(FollowLists).index.get(), this.app.use(MuteLists).index.get()),
    )
  }

  wotScore = (pubkey: string, target: string): Projection<number> => {
    const read = (
      $follows: ReadonlyMap<string, FollowListReader>,
      $mutes: ReadonlyMap<string, MuteListReader>,
      $followers: ReadonlyMap<string, Set<string>>,
      $muters: ReadonlyMap<string, Set<string>>,
    ) => {
      let follows: string[]
      let mutes: string[]

      if (pubkey) {
        const theirFollows = $follows.get(pubkey)?.pubkeys() ?? []

        follows = theirFollows.filter(other =>
          ($follows.get(other)?.pubkeys() ?? []).includes(target),
        )
        mutes = theirFollows.filter(other => ($mutes.get(other)?.pubkeys() ?? []).includes(target))
      } else {
        follows = Array.from($followers.get(target) || [])
        mutes = Array.from($muters.get(target) || [])
      }

      return follows.length - mutes.length
    }

    return projection(
      derived(
        [
          this.app.use(FollowLists).index.$,
          this.app.use(MuteLists).index.$,
          this.followersByPubkey.$,
          this.mutersByPubkey.$,
        ],
        ([$follows, $mutes, $followers, $muters]) => read($follows, $mutes, $followers, $muters),
      ),
      () =>
        read(
          this.app.use(FollowLists).index.get(),
          this.app.use(MuteLists).index.get(),
          this.followersByPubkey.get(),
          this.mutersByPubkey.get(),
        ),
    )
  }
}
