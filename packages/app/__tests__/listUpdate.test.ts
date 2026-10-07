import {describe, it, expect} from "vitest"
import {noop, sleep} from "@welshman/lib"
import {Nip01Signer} from "@welshman/signer"
import {makeEvent, matchFilters, MUTES, ROOMS, RELAYS} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import {MockAdapter, AdapterEvent, isRelayEvent} from "@welshman/net"
import type {ClientMessage, RelayMessage} from "@welshman/net"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {MuteLists} from "../src/plugins/muteLists.js"
import {RoomLists} from "../src/plugins/roomLists.js"

const RELAY = "wss://relay.example.com/"
const OTHER = "a".repeat(64)
const MUTED = "f".repeat(64)

const signer = Nip01Signer.ephemeral()

const roomList = (rooms: string[][]) =>
  signer.sign(
    makeEvent(ROOMS, {
      tags: rooms.flatMap(([id, url]) => [
        ["r", url],
        ["group", id, url],
      ]),
    }),
  )

const makeApp = async (events: TrustedEvent[]) => {
  const requested: number[] = []
  const user = await User.fromSigner(signer)

  const app: App = new App({
    user,
    getAdapter: (url: string) => {
      const adapter: MockAdapter = new MockAdapter(url, (message: ClientMessage) => {
        if (message[0] === "REQ") {
          const [, id, ...filters] = message

          requested.push(...(filters as Filter[]).flatMap(filter => filter.kinds ?? []))

          for (const event of events) {
            if (matchFilters(filters as Filter[], event)) {
              adapter.receive(["EVENT", id, event])
            }
          }

          adapter.receive(["EOSE", id])
        }
      })

      adapter.on(AdapterEvent.Receive, (message: RelayMessage) => {
        if (isRelayEvent(message)) {
          app.repository.publish(message[2])
        }
      })

      return adapter
    },
  })

  app.repository.publish(await signer.sign(makeEvent(RELAYS, {tags: [["r", RELAY]]})))

  return {app, requested}
}

const rooms = (tags: string[][]) => tags.filter(t => t[0] === "group").map(t => t[1])

describe("editing the user's own list", () => {
  it("seeds the writer from a list the index has already parsed", async () => {
    const {app} = await makeApp([])
    const plugin = app.use(RoomLists)

    // Without a subscriber the collection has no repository listener and reads empty.
    plugin.index.$.subscribe(noop)

    app.repository.publish(await roomList([["old", "wss://old.example.com/"]]))

    // Let the async eventToItem commit the item to the index.
    await sleep(50)

    const command = await plugin.addRoom("new", "wss://new.example.com/")

    expect(rooms(command.event.tags)).toEqual(["old", "new"])

    app.cleanup()
  })

  it("seeds the writer from a list that arrives during the load", async () => {
    const {app} = await makeApp([await roomList([["old", "wss://old.example.com/"]])])
    const plugin = app.use(RoomLists)

    plugin.index.$.subscribe(noop)

    const command = await plugin.addRoom("new", "wss://new.example.com/")

    expect(rooms(command.event.tags)).toEqual(["old", "new"])

    app.cleanup()
  })

  it("decrypts the list it is editing, so a private entry can be removed", async () => {
    const {app} = await makeApp([])
    const plugin = app.use(MuteLists)
    const pubkey = await signer.getPubkey()
    const content = await signer.nip44.encrypt(pubkey, JSON.stringify([["p", MUTED]]))

    plugin.index.$.subscribe(noop)

    app.repository.publish(await signer.sign(makeEvent(MUTES, {content, tags: [["p", OTHER]]})))

    await sleep(50)

    const command = await plugin.unmute(MUTED)

    expect(command.event.content).toEqual("")
    expect(command.event.tags).toContainEqual(["p", OTHER])

    app.cleanup()
  })
  it("seeds the writer from an encrypted list that arrives during the load", async () => {
    const pubkey = await signer.getPubkey()
    const content = await signer.nip44.encrypt(pubkey, JSON.stringify([["p", MUTED]]))
    const muteList = await signer.sign(makeEvent(MUTES, {content, tags: [["p", OTHER]]}))

    const {app} = await makeApp([muteList])
    const plugin = app.use(MuteLists)

    plugin.index.$.subscribe(noop)

    const command = await plugin.unmute(MUTED)

    expect(command.event.tags).toContainEqual(["p", OTHER])

    app.cleanup()
  })
})
