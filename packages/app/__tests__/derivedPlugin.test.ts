import {describe, expect, it} from "vitest"
import {MUTES} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {App} from "../src/app.js"
import type {IApp} from "../src/app.js"
import {DerivedPlugin} from "../src/plugins/base.js"

const makeEvent = (pubkey: string): TrustedEvent =>
  ({
    id: pubkey,
    pubkey,
    created_at: 0,
    kind: MUTES,
    tags: [],
    content: "",
    sig: "0".repeat(128),
  }) as TrustedEvent

// A plugin that fetches like a relay and decodes through a promise, like a list kind.
class Lists extends DerivedPlugin<TrustedEvent> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MUTES]}],
      eventToItem: async (event: TrustedEvent) => event,
      getKey: (event: TrustedEvent) => event.pubkey,
    })
  }

  fetch = async (pubkey: string) => {
    this.app.repository.publish(makeEvent(pubkey))
  }
}

class EmptyLists extends Lists {
  fetch = async () => {}
}

const stuck = "e".repeat(64)

// A plugin whose decoder never resolves for one pubkey, so that parse stays outstanding.
class PartlyStuckLists extends DerivedPlugin<TrustedEvent> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MUTES]}],
      eventToItem: (event: TrustedEvent) =>
        event.pubkey === stuck ? new Promise<TrustedEvent>(() => {}) : Promise.resolve(event),
      getKey: (event: TrustedEvent) => event.pubkey,
    })
  }

  fetch = async (pubkey: string) => {
    this.app.repository.publish(makeEvent(pubkey))
  }
}

describe("a derived plugin's loaders", () => {
  it("resolves to an item the load itself delivered", async () => {
    const plugin = new App().use(Lists)

    await expect(plugin.forceLoad("a".repeat(64))).resolves.toMatchObject({kind: MUTES})
  })

  it("resolves the same way through the cached loader", async () => {
    const plugin = new App().use(Lists)

    await expect(plugin.load("b".repeat(64))).resolves.toMatchObject({kind: MUTES})
  })

  it("keeps serving an item it has indexed", async () => {
    const plugin = new App().use(Lists)
    const pubkey = "c".repeat(64)

    await plugin.forceLoad(pubkey)

    expect(plugin.get(pubkey)).toMatchObject({kind: MUTES})
  })

  it("resolves to nothing when the load delivers nothing", async () => {
    const plugin = new App().use(EmptyLists)

    await expect(plugin.forceLoad("d".repeat(64))).resolves.toBeUndefined()
  })

  it("serves an item it has indexed without waiting on another event's parse", async () => {
    const plugin = new App().use(PartlyStuckLists)
    const pubkey = "f".repeat(64)

    await plugin.forceLoad(pubkey)

    plugin.app.repository.publish(makeEvent(stuck))

    await expect(plugin.forceLoad(pubkey)).resolves.toMatchObject({kind: MUTES})
  })
})
