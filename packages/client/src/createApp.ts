import {Client} from "./client.js"
import type {ClientOptions} from "./client.js"
import {Router} from "./router.js"
import type {RouterOptions} from "./router.js"
import {RelayStats} from "./relayStats.js"
import {RelayLists} from "./relayLists.js"
import {BlockedRelayLists} from "./blockedRelayLists.js"
import {Relays} from "./relays.js"
import {Plaintext} from "./plaintext.js"
import {Profiles} from "./profiles.js"
import {FollowLists} from "./follows.js"
import {MuteLists} from "./mutes.js"
import {PinLists} from "./pins.js"
import {BlossomServerLists} from "./blossom.js"
import {MessagingRelayLists} from "./messagingRelayLists.js"
import {SearchRelayLists} from "./searchRelayLists.js"
import {Handles} from "./handles.js"
import {Zappers} from "./zappers.js"
import {Topics} from "./topics.js"
import {Tags} from "./tags.js"
import {Wot} from "./wot.js"
import {Feeds} from "./feeds.js"
import {Searches} from "./search.js"
import {Sync} from "./sync.js"
import {GiftWraps} from "./giftWraps.js"
import {Commands} from "./commands.js"

export type AppOptions = ClientOptions & {
  dufflepudUrl?: string
  // Whether to unwrap incoming NIP-59 gift wraps (DMs) for this client's user.
  shouldUnwrap?: boolean
  // The router's data dependencies are wired up below, so callers only supply
  // the configuration knobs.
  router?: Omit<RouterOptions, "getRelaysForPubkey" | "getRelayQuality">
}

/**
 * Composes a default application instance: a `Client` plus the core data
 * modules, wired together. This is where genuine domain cycles (Router <->
 * RelayLists, RelayStats <-> BlockedRelayLists) are broken — modules are given
 * lazily-resolved closures that reach their siblings at call time, never at
 * construction time.
 *
 * Callers who want a different module set can ignore this helper and compose
 * their own bag directly, or spread additional modules onto the result.
 */
export const createApp = (options: AppOptions = {}) => {
  const client = new Client(options)
  const relays = new Relays(client)
  const plaintext = new Plaintext(client)

  // Declared up-front so the lazily-invoked closures below can reach them. None
  // are called during construction, only at routing/scoring time.
  let relayLists: RelayLists
  let blockedRelayLists: BlockedRelayLists

  const relayStats = new RelayStats(client, {
    isRelayBlocked: url => {
      const pubkey = client.user?.pubkey

      return pubkey ? blockedRelayLists.getBlockedRelays(pubkey).includes(url) : false
    },
  })

  const router = new Router(client, {
    ...options.router,
    getRelaysForPubkey: (pubkey, mode) => relayLists.getRelaysForPubkey(pubkey, mode),
    getRelayQuality: url => relayStats.getQuality(url),
  })

  relayLists = new RelayLists(client, router)
  blockedRelayLists = new BlockedRelayLists(client, relayLists)

  const profiles = new Profiles(client, relayLists)
  const followLists = new FollowLists(client, relayLists)
  const muteLists = new MuteLists(client, relayLists, plaintext)
  const pinLists = new PinLists(client, relayLists)
  const blossomServerLists = new BlossomServerLists(client, relayLists)
  const messagingRelayLists = new MessagingRelayLists(client, relayLists)
  const searchRelayLists = new SearchRelayLists(client, relayLists)
  const handles = new Handles(client, profiles, {dufflepudUrl: options.dufflepudUrl})
  const zappers = new Zappers(client, profiles, {dufflepudUrl: options.dufflepudUrl})
  const topics = new Topics(client)
  const tags = new Tags(client, router, profiles)
  const wot = new Wot(client, followLists, muteLists)
  const feeds = new Feeds(client, wot)
  const searches = new Searches(client, router, profiles, topics, relays, handles, wot)
  const sync = new Sync(client, relays)
  const giftWraps = new GiftWraps(client, {shouldUnwrap: options.shouldUnwrap})

  // Commands act on behalf of a signed-in user, so they're only available when
  // the client has one.
  const commands = client.user
    ? new Commands({
        client,
        user: client.user,
        router,
        relayLists,
        messagingRelayLists,
        blockedRelayLists,
        searchRelayLists,
        followLists,
        muteLists,
        pinLists,
      })
    : undefined

  return {
    client,
    router,
    relays,
    plaintext,
    relayStats,
    relayLists,
    blockedRelayLists,
    profiles,
    followLists,
    muteLists,
    pinLists,
    blossomServerLists,
    messagingRelayLists,
    searchRelayLists,
    handles,
    zappers,
    topics,
    tags,
    wot,
    feeds,
    searches,
    sync,
    giftWraps,
    commands,
    cleanup: () => {
      relayStats.cleanup()
      giftWraps.cleanup()
      client.cleanup()
    },
  }
}

export type App = ReturnType<typeof createApp>
