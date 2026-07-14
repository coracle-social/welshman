import type {TrustedEvent, Resolver} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {Repository} from "@welshman/net"
import type {EventReader} from "./EventReader.js"
import type {EventWriter} from "./EventWriter.js"
import {EventRouter} from "./EventRouter.js"

export type KindContext = {
  resolver: Resolver
  signer?: ISigner
  repository?: Repository
}

export type KindConfig<
  Reader extends EventReader,
  Writer extends EventWriter<Reader>,
  Router extends EventRouter = EventRouter,
> = {
  kind: number
  reader: new (def: AnyConfiguredKind, event: TrustedEvent) => Reader
  writer: new (def: AnyConfiguredKind, reader?: Reader) => Writer
  router?: new (def: AnyConfiguredKind) => Router
}

/**
 * Bundles a kind's reader, writer, and (optional) router classes.
 *
 * Usage: `export const Profile = new KindFactory({reader: ProfileReader, writer:
 * ProfileWriter})`, then `Profile.configure(context)` to bind the app's
 * dependencies once.
 */
export class KindFactory<
  Reader extends EventReader,
  Writer extends EventWriter<Reader>,
  Router extends EventRouter = EventRouter,
> {
  constructor(readonly config: KindConfig<Reader, Writer, Router>) {}

  get kind(): number {
    return this.config.kind
  }

  configure(context: KindContext): ConfiguredKind<Reader, Writer, Router> {
    return new ConfiguredKind(this.config, context)
  }
}

/**
 * A kind bound to a `KindContext`. Produces readers, writers, and routers which share
 * the configured dependencies.
 */
export class ConfiguredKind<
  Reader extends EventReader,
  Writer extends EventWriter<Reader>,
  Router extends EventRouter = EventRouter,
> {
  constructor(
    readonly config: KindConfig<Reader, Writer, Router>,
    readonly context: KindContext,
  ) {}

  get kind(): number {
    return this.config.kind
  }

  reader = async (event: TrustedEvent): Promise<Reader> => {
    if (event.kind !== this.kind) {
      throw new Error(`Expected a kind ${this.kind} event, got kind ${event.kind}`)
    }

    const reader = new this.config.reader(this, event)

    await reader.parse()

    return reader
  }

  writer = (reader?: Reader): Writer => new this.config.writer(this, reader)

  router = (): Router => {
    const Ctor = this.config.router ?? EventRouter

    return new Ctor(this) as Router
  }
}

// A loosely-typed reference to the owning configured kind, injected into every
// reader/writer instance so it can reach the context. The `any` params dodge the
// circular generics — precise types live on the concrete `ConfiguredKind` wrapper.
export type AnyConfiguredKind = ConfiguredKind<any, any, any>
