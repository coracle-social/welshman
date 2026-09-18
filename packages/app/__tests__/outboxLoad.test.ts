import {describe, it, expect} from "vitest"
import {Nip01Signer} from "@welshman/signer"
import {makeEvent, matchFilters, NOTE, RELAYS, MESSAGING_RELAYS} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import {MockAdapter, AdapterEvent, isRelayEvent} from "@welshman/net"
import type {ClientMessage, RelayMessage} from "@welshman/net"
import {App} from "../src/app.js"
import {Network} from "../src/plugins/network.js"
import {MessagingRelayLists} from "../src/plugins/messagingRelayLists.js"

// Two indexers, of which only the slower to answer carries the relay list.
const QUIET = "wss://quiet.example.com/"
const SLOW = "wss://slow.example.com/"
const MAIL = "wss://mail.example.com/"

type Relay = {events: TrustedEvent[]; delay: number}

// A relay serves what it holds after its own delay, then eoses.
const makeAdapter = (app: App, url: string, {events, delay}: Relay) => {
  const adapter: MockAdapter = new MockAdapter(url, (message: ClientMessage) => {
    if (message[0] === "REQ") {
      const [_, id, ...filters] = message

      setTimeout(() => {
        for (const event of events) {
          if (matchFilters(filters as Filter[], event)) {
            adapter.receive(["EVENT", id, event])
          }
        }

        adapter.receive(["EOSE", id])
      }, delay)
    }
  })

  // The app's own ingest policy listens to sockets, and a mock adapter has none.
  adapter.on(AdapterEvent.Receive, (message: RelayMessage) => {
    if (isRelayEvent(message)) {
      app.repository.publish(message[2])
    }
  })

  return adapter
}

const makeApp = (relays: Record<string, Relay>) => {
  const app: App = new App({
    config: {getIndexerRelays: () => [QUIET, SLOW]},
    getAdapter: (url: string) => makeAdapter(app, url, relays[url]),
  })

  return app
}

describe("loading over the outbox model", () => {
  // The 10050 is reachable only through the 10002, so a relay list reported absent while the
  // indexer holding it is still answering leaves the messaging relay list unasked for.
  it("waits for every indexer before concluding an author has no relay list", async () => {
    const signer = Nip01Signer.ephemeral()
    const pubkey = await signer.getPubkey()

    const relayList = await signer.sign(makeEvent(RELAYS, {tags: [["r", MAIL, "write"]]}))
    const messagingRelayList = await signer.sign(
      makeEvent(MESSAGING_RELAYS, {tags: [["relay", MAIL]]}),
    )

    const app = makeApp({
      [QUIET]: {events: [], delay: 10},
      [SLOW]: {events: [relayList], delay: 200},
      [MAIL]: {events: [messagingRelayList], delay: 10},
    })

    const list = await app.use(MessagingRelayLists).load(pubkey)

    expect(list?.urls()).toEqual([MAIL])
  })
})

describe("the app's two loaders", () => {
  const makeNoteApp = async () => {
    const signer = Nip01Signer.ephemeral()
    const note = await signer.sign(makeEvent(NOTE, {content: "hi"}))

    return {
      note,
      app: makeApp({
        [QUIET]: {events: [], delay: 10},
        [SLOW]: {events: [note], delay: 200},
      }),
    }
  }

  it("resolves loadComplete once every relay has answered", async () => {
    const {app, note} = await makeNoteApp()

    const events = await app.use(Network).loadComplete({
      relays: [QUIET, SLOW],
      filters: [{kinds: [NOTE]}],
    })

    expect(events.map(e => e.id)).toEqual([note.id])
  })

  it("resolves loadLenient once half of them have", async () => {
    const {app} = await makeNoteApp()

    const events = await app.use(Network).loadLenient({
      relays: [QUIET, SLOW],
      filters: [{kinds: [NOTE]}],
    })

    expect(events).toEqual([])
  })
})
