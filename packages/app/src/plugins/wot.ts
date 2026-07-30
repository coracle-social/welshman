import {writable} from "svelte/store"
import {on, inc, dec, throttle, addToMapKey} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {FOLLOWS, MUTES, hexTags, tagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {RepositoryUpdate} from "@welshman/net"
import {deriveDeduplicated} from "@welshman/store"
import {projection} from "./base.js"
import type {Projection} from "./base.js"
import type {IApp} from "../app.js"

const NO_PUBKEYS: Set<string> = new Set()

// The pubkeys each pubkey points at.
type Edges = Map<string, Set<string>>

/**
 * How much of the graph a read counts: every list in the repository, or only the
 * lists the current user's follows published.
 */
export enum WotScope {
  Global = "global",
  Follows = "follows",
}

// The pubkeys a list points at. Public tags only: a mute list's private entries are
// encrypted to their author, so they're no part of a graph built out of what
// everyone can see.
const listPubkeys = (event: TrustedEvent) => tagValues(hexTags("p"), event.tags)

// The pubkeys pointing at a target, narrowed to `trust` when there is one.
const trusted = (sources: Maybe<Set<string>>, trust?: Set<string>) => {
  const pubkeys = Array.from(sources ?? NO_PUBKEYS)

  return trust ? pubkeys.filter(pubkey => trust.has(pubkey)) : pubkeys
}

const countTrusted = (sources: Maybe<Set<string>>, trust?: Set<string>) => {
  if (!trust) return sources?.size ?? 0

  let count = 0

  for (const pubkey of sources ?? NO_PUBKEYS) {
    if (trust.has(pubkey)) {
      count += 1
    }
  }

  return count
}

/**
 * Web of trust: who follows and mutes whom, built from the public tags on follow
 * (NIP-02) and mute (NIP-51) lists as they land in the repository. A list rewrites
 * its author's edges as it arrives — so an update costs the one list that changed,
 * and every read is a lookup into the graph.
 *
 * Reads about a pubkey from the outside take a `WotScope`: `Global` counts every
 * list in the repository, `Follows` counts only what the user's follows published —
 * the pubkey as the user sees it. The user's follow list is part of the same graph,
 * so a `Follows` read tracks it changing like it tracks anything else.
 *
 * Every read is a `Projection` — subscribe via `.$`, snapshot via `.get()`.
 */
export class Wot {
  private followsByPubkey: Edges = new Map()
  private followersByPubkey: Edges = new Map()
  private mutesByPubkey: Edges = new Map()
  private mutersByPubkey: Edges = new Map()

  // Bumped once per burst of changes; reads derive from it
  private updates = writable(0)

  constructor(readonly app: IApp) {
    const notify = throttle(300, () => this.updates.update(inc))

    const unsubscribe = on(app.repository, "update", ({added, removed}: RepositoryUpdate) => {
      let changed = false

      // Removals first: replacing a list reports the old event as removed in the same
      // update that adds its replacement, which then puts the new edges in place. What
      // that leaves is a list that was deleted or expired, with nothing taking over.
      for (const id of removed) {
        const event = app.repository.getEvent(id)

        if (event) {
          changed = this.setList(event, undefined) || changed
        }
      }

      for (const event of added) {
        changed = this.setList(event, listPubkeys(event)) || changed
      }

      if (changed) {
        notify()
      }
    })

    app.onCleanup(unsubscribe)

    // Catch up on the lists that were already there
    for (const event of app.repository.query([{kinds: [FOLLOWS, MUTES]}])) {
      this.setList(event, listPubkeys(event))
    }
  }

  // Point an author's list of this event's kind at `targets`, or at nothing when the
  // list is gone. Returns whether it was a kind we track.
  private setList = (event: TrustedEvent, targets: Maybe<string[]>) => {
    if (event.kind === FOLLOWS) {
      this.setEdges(event.pubkey, targets, this.followsByPubkey, this.followersByPubkey)
    } else if (event.kind === MUTES) {
      this.setEdges(event.pubkey, targets, this.mutesByPubkey, this.mutersByPubkey)
    } else {
      return false
    }

    return true
  }

  // Replace the edges from `pubkey`, keeping the reverse index in step.
  private setEdges = (pubkey: string, targets: Maybe<string[]>, forward: Edges, reverse: Edges) => {
    for (const target of forward.get(pubkey) ?? NO_PUBKEYS) {
      const sources = reverse.get(target)

      sources?.delete(pubkey)

      if (sources?.size === 0) {
        reverse.delete(target)
      }
    }

    forward.delete(pubkey)

    if (targets?.length) {
      forward.set(pubkey, new Set(targets))

      for (const target of targets) {
        addToMapKey(reverse, target, pubkey)
      }
    }
  }

  // Reads are lookups, re-run when the graph changes, and deduplicated so a value
  // that came out the same doesn't wake its subscribers.
  private project = <T>(read: () => T): Projection<T> =>
    projection(deriveDeduplicated(this.updates, read), read)

  /**
   * What a `Follows` read counts: the pubkeys the user follows, read out of the same
   * graph, so it's as current as the rest of a read. With no user there's nothing to
   * narrow by, so the read stays global.
   */
  private trust = (scope: WotScope) => {
    const pubkey = scope === WotScope.Follows ? this.app.user?.pubkey : undefined

    return pubkey ? (this.followsByPubkey.get(pubkey) ?? NO_PUBKEYS) : undefined
  }

  follows = (target: string): Projection<string[]> =>
    this.project(() => Array.from(this.followsByPubkey.get(target) ?? NO_PUBKEYS))

  mutes = (target: string): Projection<string[]> =>
    this.project(() => Array.from(this.mutesByPubkey.get(target) ?? NO_PUBKEYS))

  followers = (target: string, scope: WotScope): Projection<string[]> =>
    this.project(() => trusted(this.followersByPubkey.get(target), this.trust(scope)))

  muters = (target: string, scope: WotScope): Projection<string[]> =>
    this.project(() => trusted(this.mutersByPubkey.get(target), this.trust(scope)))

  score = (target: string, scope: WotScope): Projection<number> =>
    this.project(() => {
      const trust = this.trust(scope)

      return (
        countTrusted(this.followersByPubkey.get(target), trust) -
        countTrusted(this.mutersByPubkey.get(target), trust)
      )
    })

  network = (target: string): Projection<string[]> =>
    this.project(() => {
      const follows = this.followsByPubkey.get(target) ?? NO_PUBKEYS
      const network = new Set<string>()

      for (const pubkey of follows) {
        for (const other of this.followsByPubkey.get(pubkey) ?? NO_PUBKEYS) {
          if (!follows.has(other)) {
            network.add(other)
          }
        }
      }

      return Array.from(network)
    })

  /**
   * Every pubkey's score at once, for the callers that need the whole picture —
   * ranking search results, resolving a score range — rather than a projection per
   * pubkey.
   */
  scores = (scope: WotScope): Projection<Map<string, number>> =>
    this.project(() => {
      const trust = this.trust(scope)
      const scores = new Map<string, number>()

      if (trust) {
        for (const pubkey of trust) {
          for (const target of this.followsByPubkey.get(pubkey) ?? NO_PUBKEYS) {
            scores.set(target, inc(scores.get(target)))
          }

          for (const target of this.mutesByPubkey.get(pubkey) ?? NO_PUBKEYS) {
            scores.set(target, dec(scores.get(target)))
          }
        }
      } else {
        for (const [target, followers] of this.followersByPubkey) {
          scores.set(target, followers.size)
        }

        for (const [target, muters] of this.mutersByPubkey) {
          scores.set(target, (scores.get(target) ?? 0) - muters.size)
        }
      }

      return scores
    })
}
