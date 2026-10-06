import {describe, it, expect} from "vitest"
import {noop, sleep} from "@welshman/lib"
import {Nip01Signer} from "@welshman/signer"
import {makeEvent, matchFilters, MUTES, RELAYS} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import {MockAdapter, AdapterEvent, isRelayEvent} from "@welshman/net"
import type {ClientMessage, RelayMessage} from "@welshman/net"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {MuteLists} from "../src/plugins/muteLists.js"

const RELAY = "wss://relay.example.com/"

const muteList = (signer: Nip01Signer, muted: string[]) =>
  signer.sign(makeEvent(MUTES, {tags: muted.map(value => ["p", value])}))

const relayList = (signer: Nip01Signer) => signer.sign(makeEvent(RELAYS, {tags: [["r", RELAY]]}))

// An app over a single relay which serves what it holds after 20ms, then eoses.
const makeApp = async (signer: Nip01Signer, events: TrustedEvent[]) => {
  const user = await User.fromSigner(signer)

  const app: App = new App({
    user,
    getAdapter: (url: string) => {
      const adapter: MockAdapter = new MockAdapter(url, (message: ClientMessage) => {
        if (message[0] === "REQ") {
          const [, id, ...filters] = message

          setTimeout(() => {
            for (const event of events) {
              if (matchFilters(filters as Filter[], event)) {
                adapter.receive(["EVENT", id, event])
              }
            }

            adapter.receive(["EOSE", id])
          }, 20)
        }
      })

      // The app's own ingest policy listens to sockets, and a mock adapter has none.
      adapter.on(AdapterEvent.Receive, (message: RelayMessage) => {
        if (isRelayEvent(message)) {
          app.repository.publish(message[2])
        }
      })

      return adapter
    },
  })

  // A rendered UI keeps the collection subscribed; an unsubscribed index is rebuilt per read.
  app.use(MuteLists).index.$.subscribe(noop)

  return app
}

const muted = (event: TrustedEvent) => event.tags.filter(t => t[0] === "p").map(t => t[1])

describe("a list update through Domain", () => {
  it("edits the user's own event and returns the command that publishes it", async () => {
    const signer = Nip01Signer.ephemeral()
    const app = await makeApp(signer, [])

    app.repository.publish(await relayList(signer))
    app.repository.publish(await muteList(signer, ["old"]))

    await sleep(10)

    const command = await app.use(MuteLists).mutePublicly(["p", "new"])

    expect(muted(command.event)).toEqual(["old", "new"])
    expect(command.event.kind).toEqual(MUTES)

    app.cleanup()
  })

  it("loads the list before editing when the collection holds none", async () => {
    const signer = Nip01Signer.ephemeral()
    const app = await makeApp(signer, [await relayList(signer), await muteList(signer, ["remote"])])

    app.repository.publish(await relayList(signer))

    expect(app.use(MuteLists).get(await signer.getPubkey())).toBeUndefined()

    const command = await app.use(MuteLists).mutePublicly(["p", "new"])

    expect(muted(command.event)).toEqual(["remote", "new"])

    app.cleanup()
  })

  it("refuses to edit with nobody signed in", async () => {
    const signer = Nip01Signer.ephemeral()
    const app: App = new App({})

    app.repository.publish(await muteList(signer, ["old"]))

    await expect(app.use(MuteLists).mutePublicly(["p", "new"])).rejects.toThrow()

    app.cleanup()
  })
})
