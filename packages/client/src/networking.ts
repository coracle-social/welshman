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
import type {IClient} from "./client.js"

/**
 * Net utilities bound to the client's net context (its pool + repository). Reach
 * it via `client.use(Networking)`; `load` is a shared, batched loader.
 */
export class Networking {
  load: Loader

  constructor(readonly ctx: IClient) {
    this.load = this.makeLoader({delay: 200, timeout: 3000, threshold: 0.5})
  }

  request = (options: Omit<RequestOptions, "context">) =>
    request({...options, context: this.ctx.netContext})

  publish = (options: Omit<PublishOptions, "context">) =>
    publish({...options, context: this.ctx.netContext})

  diff = (options: Omit<DiffOptions, "context">) => diff({...options, context: this.ctx.netContext})

  pull = (options: Omit<PullOptions, "context">) => pull({...options, context: this.ctx.netContext})

  push = (options: Omit<PushOptions, "context">) => push({...options, context: this.ctx.netContext})

  makeLoader = (options: Omit<LoaderOptions, "context">): Loader =>
    makeLoader({...options, context: this.ctx.netContext})
}
