import {describe, expect, it} from "vitest"
import {NOTE, Resolver} from "@welshman/util"
import {MockAdapter} from "@welshman/net"
import type {ClientMessage} from "@welshman/net"
import {requestPage} from "../src/request"

const hub = "wss://hub.example/"

// Every author writes to one relay, so every chunk resolves to it with the same filter but authors
const requestFollows = async (count: number) => {
  const authors = Array.from({length: count}, (_, i) => i.toString(16).padStart(64, "0"))
  const frames = new Map<string, ClientMessage[]>()
  const adapters = new Map<string, MockAdapter>()

  const getAdapter = (url: string) => {
    if (!adapters.has(url)) {
      const adapter: MockAdapter = new MockAdapter(url, (message: ClientMessage) => {
        frames.set(url, (frames.get(url) ?? []).concat([message]))

        if (message[0] === "REQ") {
          adapter.receive(["EOSE", message[1]])
        }
      })

      adapters.set(url, adapter)
    }

    return adapters.get(url)!
  }

  const resolver = new Resolver(route => (route.type === "pubkeyOutbox" ? [hub] : []))

  await requestPage({
    autoClose: true,
    filters: [{kinds: [NOTE], authors}],
    router: {resolve: selections => resolver.scenario(selections)},
    context: {getAdapter},
    onEvent: () => undefined,
  })

  return (frames.get(hub) ?? []).filter(([type]) => type === "REQ")
}

describe("requestPage", () => {
  it("sends one REQ to a relay however many author chunks resolved to it", async () => {
    const reqs = await requestFollows(90)

    expect(reqs).toHaveLength(1)
    expect(reqs[0][2].authors).toHaveLength(90)
  })
})
