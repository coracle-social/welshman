import {chunk, first} from "@welshman/lib"
import {sortEventsDesc} from "@welshman/util"
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
import {addMinimalFallbacks} from "@welshman/router"
import {Router} from "./router.js"
import {RelayLists} from "./relayLists.js"
import type {IApp} from "../app.js"

/**
 * Net utilities bound to the app's net context (its pool + repository). Reach
 * it via `app.use(Network)`; `load` is a shared, batched loader.
 */
export class Network {
  load: Loader

  constructor(readonly app: IApp) {
    this.load = this.makeLoader({delay: 50, timeout: 3000, threshold: 0.5})
  }

  makeLoader = (options: Omit<LoaderOptions, "context">): Loader =>
    makeLoader({...options, context: this.app.netContext})

  request = (options: Omit<RequestOptions, "context">) =>
    request({...options, context: this.app.netContext})

  publish = (options: Omit<PublishOptions, "context">) =>
    publish({...options, context: this.app.netContext})

  diff = (options: Omit<DiffOptions, "context">) => diff({...options, context: this.app.netContext})

  pull = (options: Omit<PullOptions, "context">) => pull({...options, context: this.app.netContext})

  push = (options: Omit<PushOptions, "context">) => push({...options, context: this.app.netContext})

  loadUsingOutbox = async (pubkey: string, filter: Filter = {}, relayHints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const writeRelays = (await this.app.use(RelayLists).load(pubkey))?.writeUrls() ?? []
    const allRelays = this.app
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
