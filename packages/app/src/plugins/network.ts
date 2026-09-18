import {first} from "@welshman/lib"
import {sortEventsDesc, outbox, relays} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {request, publish, makeLoader} from "@welshman/net"
import type {
  Loader,
  LoadOptions,
  LoaderOptions,
  RequestOptions,
  PublishOptions,
} from "@welshman/net"
import {Router} from "./router.js"
import type {IApp} from "../app.js"

/**
 * Net utilities bound to the app's net context (its pool + repository). Reach
 * it via `app.use(Network)`; `loadComplete` and `loadLenient` are shared, batched loaders.
 */
export class Network {
  // Resolves once every relay has closed or timed out.
  loadComplete: Loader

  // Resolves as soon as half the relays have closed, leaving the rest open.
  loadLenient: Loader

  private controller = new AbortController()

  constructor(readonly app: IApp) {
    this.loadComplete = this.makeLoader({delay: 50, timeout: 3000})
    this.loadLenient = this.makeLoader({delay: 50, timeout: 3000, threshold: 0.5})

    app.onCleanup(() => this.controller.abort())
  }

  private withSignal = <T extends {signal?: AbortSignal}>(options: T) => ({
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, this.controller.signal])
      : this.controller.signal,
  })

  makeLoader = (options: Omit<LoaderOptions, "context">): Loader => {
    const load = makeLoader({...options, context: this.app.netContext})

    return (loadOptions: LoadOptions) => load(this.withSignal(loadOptions))
  }

  request = (options: Omit<RequestOptions, "context">) =>
    request({...this.withSignal(options), context: this.app.netContext})

  publish = (options: Omit<PublishOptions, "context">) =>
    publish({...this.withSignal(options), context: this.app.netContext})

  loadUsingOutbox = async (pubkey: string, filter: Filter = {}, hints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const scenario = await this.app.use(Router).resolve([...relays(hints), outbox(pubkey)])
    const urls = scenario.getUrls()
    const events = await this.loadComplete({filters, relays: urls})

    return first(sortEventsDesc(events))
  }

  // Like `loadUsingOutbox`, but for collections rather than a single replaceable/singleton value —
  // returns every matching event instead of just the newest one.
  loadAllUsingOutbox = async (pubkey: string, filter: Filter = {}, hints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const scenario = await this.app.use(Router).resolve([...relays(hints), outbox(pubkey)])
    const urls = scenario.getUrls()

    return this.loadComplete({filters, relays: urls})
  }
}
