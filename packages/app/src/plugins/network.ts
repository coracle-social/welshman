import {first} from "@welshman/lib"
import {sortEventsDesc, outbox, relays} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {request, publish, makeLoader} from "@welshman/net"
import type {Loader, LoaderOptions, RequestOptions, PublishOptions} from "@welshman/net"
import {Router} from "./router.js"
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

  loadUsingOutbox = async (pubkey: string, filter: Filter = {}, hints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const scenario = await this.app.use(Router).resolve([...relays(hints), outbox(pubkey)])
    const urls = scenario.getUrls()
    const events = await this.load({filters, relays: urls})

    return first(sortEventsDesc(events))
  }

  // Like `loadUsingOutbox`, but for collections rather than a single replaceable/singleton value —
  // returns every matching event instead of just the newest one.
  loadAllUsingOutbox = async (pubkey: string, filter: Filter = {}, hints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const scenario = await this.app.use(Router).resolve([...relays(hints), outbox(pubkey)])
    const urls = scenario.getUrls()

    return this.load({filters, relays: urls})
  }
}
