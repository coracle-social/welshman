import {chunk, first} from "@welshman/lib"
import {RelayMode, getRelaysFromList, sortEventsDesc} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {request, publish, diff, pull, push, makeLoader} from "@welshman/net"
import type {
  Loader,
  LoaderOptions,
  RequestOptions,
  PublishOptions,
  DiffOptions,
  PullOptions,
  PushOptions,
} from "@welshman/net"
import {Router, addMinimalFallbacks} from "./router.js"
import {RelayLists} from "./relayLists.js"
import type {IClient} from "./client.js"

/**
 * Net utilities bound to the client's net context (its pool + repository). Reach
 * it via `client.use(Network)`; `load` is a shared, batched loader.
 */
export class Network {
  load: Loader

  constructor(readonly ctx: IClient) {
    this.load = this.makeLoader({delay: 50, timeout: 3000, threshold: 0.5})
  }

  makeLoader = (options: Omit<LoaderOptions, "context">): Loader =>
    makeLoader({...options, context: this.ctx.netContext})

  request = (options: Omit<RequestOptions, "context">) =>
    request({...options, context: this.ctx.netContext})

  publish = (options: Omit<PublishOptions, "context">) =>
    publish({...options, context: this.ctx.netContext})

  diff = (options: Omit<DiffOptions, "context">) => diff({...options, context: this.ctx.netContext})

  pull = (options: Omit<PullOptions, "context">) => pull({...options, context: this.ctx.netContext})

  push = (options: Omit<PushOptions, "context">) => push({...options, context: this.ctx.netContext})

  loadUsingOutbox = async (pubkey: string, filter: Filter = {}, relayHints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const writeRelays = getRelaysFromList(await this.ctx.use(RelayLists).load(pubkey), RelayMode.Write)
    const allRelays = this.ctx
      .use(Router)
      .FromRelays([...relayHints, ...writeRelays])
      .policy(addMinimalFallbacks)
      .limit(8)
      .getUrls()

    for (const relays of chunk(2, allRelays)) {
      const events = await this.load({filters, relays})

      if (events.length > 0) {
        return first(sortEventsDesc(events))
      }
    }
  }
}
