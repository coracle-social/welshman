import {describe, it, expect} from "vitest"
import {FOLLOWS, MUTES} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {Wot, WotScope} from "../src/plugins/wot.js"

const AUTHORS = 500
const FOLLOWS_EACH = 300
const POPULATION = 5000
const SCORES = 200

const pk = (i: number) => i.toString(16).padStart(64, "0")

let nextId = 0

const makeList = (
  author: string,
  kind: number,
  pubkeys: number[],
  overrides: Partial<TrustedEvent> = {},
): TrustedEvent =>
  ({
    id: `e${nextId++}`.padStart(64, "0"),
    pubkey: author,
    kind,
    created_at: 0,
    content: "",
    tags: pubkeys.map(p => ["p", pk(p)]),
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const makeUser = () => User.fromSigner(Nip01Signer.ephemeral())

// Notifications are debounced; the graph itself is current as soon as an event lands
const settle = () => new Promise(resolve => setTimeout(resolve, 500))

describe("Wot", () => {
  it("builds the graph from lists already in the repository", () => {
    const app = new App()

    app.repository.publish(makeList(pk(1), FOLLOWS, [3, 4]))
    app.repository.publish(makeList(pk(2), FOLLOWS, [3]))
    app.repository.publish(makeList(pk(2), MUTES, [4]))

    const wot = app.use(Wot)

    expect(wot.follows(pk(1)).get()).toEqual([pk(3), pk(4)])
    expect(wot.mutes(pk(2)).get()).toEqual([pk(4)])
    expect(wot.followers(pk(3), WotScope.Global).get().sort()).toEqual([pk(1), pk(2)].sort())
    expect(wot.muters(pk(4), WotScope.Global).get()).toEqual([pk(2)])
    expect(wot.score(pk(3), WotScope.Global).get()).toBe(2)
    expect(wot.score(pk(4), WotScope.Global).get()).toBe(0)
    expect(wot.network(pk(1)).get()).toEqual([])

    app.cleanup()
  })

  it("takes in lists as they arrive", () => {
    const app = new App()
    const wot = app.use(Wot)

    app.repository.publish(makeList(pk(1), FOLLOWS, [9]))
    app.repository.publish(makeList(pk(2), MUTES, [9]))

    expect(wot.followers(pk(9), WotScope.Global).get()).toEqual([pk(1)])
    expect(wot.muters(pk(9), WotScope.Global).get()).toEqual([pk(2)])
    expect(wot.score(pk(9), WotScope.Global).get()).toBe(0)

    app.cleanup()
  })

  it("counts only the user's follows when a read isn't global", async () => {
    const user = await makeUser()
    const app = new App({user})
    const wot = app.use(Wot)

    // Two pubkeys follow 9 and one mutes it, but the user only follows 1 and 3
    app.repository.publish(makeList(pk(1), FOLLOWS, [9]))
    app.repository.publish(makeList(pk(2), FOLLOWS, [9]))
    app.repository.publish(makeList(pk(3), MUTES, [9]))
    app.repository.publish(makeList(user.pubkey, FOLLOWS, [1, 3]))

    expect(wot.score(pk(9), WotScope.Global).get()).toBe(1)
    expect(wot.score(pk(9), WotScope.Follows).get()).toBe(0)
    expect(wot.followers(pk(9), WotScope.Follows).get()).toEqual([pk(1)])
    expect(wot.muters(pk(9), WotScope.Follows).get()).toEqual([pk(3)])
    expect(wot.scores(WotScope.Global).get().get(pk(9))).toBe(1)
    expect(wot.scores(WotScope.Follows).get().get(pk(9))).toBe(0)

    // The user's own list is part of the graph, so unfollowing 3 lands like anything
    // else and their mute stops counting
    app.repository.publish(makeList(user.pubkey, FOLLOWS, [1], {created_at: 1}))

    expect(wot.score(pk(9), WotScope.Follows).get()).toBe(1)
    expect(wot.muters(pk(9), WotScope.Follows).get()).toEqual([])

    app.cleanup()
  })

  it("stays global for a non-global read when there's no user", () => {
    const app = new App()
    const wot = app.use(Wot)

    app.repository.publish(makeList(pk(1), FOLLOWS, [9]))

    expect(wot.score(pk(9), WotScope.Follows).get()).toBe(1)
    expect(wot.followers(pk(9), WotScope.Follows).get()).toEqual([pk(1)])

    app.cleanup()
  })

  it("follows a list that's replaced", () => {
    const app = new App()
    const wot = app.use(Wot)

    app.repository.publish(makeList(pk(1), FOLLOWS, [8, 9]))

    expect(wot.follows(pk(1)).get()).toEqual([pk(8), pk(9)])
    expect(wot.followers(pk(8), WotScope.Global).get()).toEqual([pk(1)])

    // A newer follow list drops pubkey 8 and picks up 7
    app.repository.publish(makeList(pk(1), FOLLOWS, [7, 9], {created_at: 1}))

    expect(wot.follows(pk(1)).get()).toEqual([pk(7), pk(9)])
    expect(wot.followers(pk(8), WotScope.Global).get()).toEqual([])
    expect(wot.followers(pk(7), WotScope.Global).get()).toEqual([pk(1)])
    expect(wot.followers(pk(9), WotScope.Global).get()).toEqual([pk(1)])

    app.cleanup()
  })

  it("reports the network as follows-of-follows", () => {
    const app = new App()
    const wot = app.use(Wot)

    app.repository.publish(makeList(pk(1), FOLLOWS, [2, 3]))
    app.repository.publish(makeList(pk(2), FOLLOWS, [3, 4]))
    app.repository.publish(makeList(pk(3), FOLLOWS, [5]))

    // 3 is a direct follow, so it's excluded; 4 and 5 are one step further out
    expect(wot.network(pk(1)).get().sort()).toEqual([pk(4), pk(5)].sort())

    app.cleanup()
  })

  it("keeps up with a stream of follow lists while scores are subscribed", async () => {
    const user = await makeUser()
    const app = new App({user})
    const wot = app.use(Wot)
    const authors = Array.from({length: AUTHORS}, (_, i) => i + 1)

    app.repository.publish(makeList(user.pubkey, FOLLOWS, authors))

    const lists = authors.map(author =>
      makeList(
        pk(author),
        FOLLOWS,
        Array.from({length: FOLLOWS_EACH}, (_, i) => ((author * 7 + i * 13) % POPULATION) + 1),
      ),
    )

    // Live scores, as a feed rendering these pubkeys would have
    const seen = new Map<string, number>()
    const unsubscribers = Array.from({length: SCORES}, (_, i) =>
      wot.score(pk(i + 1), WotScope.Follows).$.subscribe(score => seen.set(pk(i + 1), score)),
    )

    const start = Date.now()

    for (const list of lists) {
      app.repository.publish(list)

      await Promise.resolve()
    }

    // Rescoring per event per subscription would put this in the minutes
    expect(Date.now() - start).toBeLessThan(5000)

    const expected = new Map<string, number>()

    for (const list of lists) {
      for (const tag of list.tags) {
        expected.set(tag[1], (expected.get(tag[1]) ?? 0) + 1)
      }
    }

    const $scores = wot.scores(WotScope.Follows).get()

    expect($scores.size).toBe(expected.size)

    for (const [pubkey, score] of expected) {
      expect($scores.get(pubkey)).toBe(score)
      expect(wot.score(pubkey, WotScope.Follows).get()).toBe(score)
    }

    // Subscribers catch up when the notification lands
    await settle()

    expect(seen.size).toBe(SCORES)

    for (const [pubkey, score] of seen) {
      expect(score).toBe(expected.get(pubkey) ?? 0)
    }

    unsubscribers.forEach(unsubscribe => unsubscribe())
    app.cleanup()
  }, 30000)
})
