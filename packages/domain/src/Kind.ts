import type {TrustedEvent, RelaySelection} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader} from "./EventReader.js"
import type {EventBuilder} from "./EventBuilder.js"
import type {EventRouter} from "./EventRouter.js"

export type KindConfig<R extends EventReader, B extends EventBuilder<R>> = {
  reader: new (def: AnyKind, event: TrustedEvent) => R
  builder: new (def: AnyKind, reader?: R) => B
  // Loose in the reader type (like AnyKind) so a router pinned to a concrete
  // reader — e.g. `RelayListRouter extends EventRouter<RelayListReader>` — fits.
  router: new (event?: TrustedEvent, builder?: EventBuilder<any>) => EventRouter<any>
}

/**
 * Bundles a kind's reader, builder, and router.
 *
 * Usage: `export const Profile = new Kind({reader: ProfileReader, builder: ProfileBuilder, router: IndexedRouter})`
 * then `Profile.read(event)`, `Profile.build(reader)`, `Profile.factory(signer)`.
 */
export class Kind<R extends EventReader, B extends EventBuilder<R>> {
  constructor(private readonly config: KindConfig<R, B>) {}

  // Parse an event into a reader (validating its kind), replacing `fromEvent`.
  async read(event: TrustedEvent, signer?: ISigner): Promise<R> {
    const reader = new this.config.reader(this, event)

    if (event.kind !== reader.kind) {
      throw new Error(`Expected a kind ${reader.kind} event, got kind ${event.kind}`)
    }

    await reader.parse(signer)

    return reader
  }

  // A reusable, signer-bound `read`
  factory(signer?: ISigner): (event: TrustedEvent) => Promise<R> {
    return (event: TrustedEvent) => this.read(event, signer)
  }

  // A fresh builder, optionally seeded from a reader.
  builder(reader?: R): B {
    return new this.config.builder(this, reader)
  }

  // A router over an event and/or a builder (its `before` state).
  router(event?: TrustedEvent, builder?: EventBuilder<EventReader>): EventRouter {
    return new this.config.router(event, builder)
  }
}

// A loosely-typed reference to the owning kind, injected into every instance. The
// `any` params dodge the circular generics — precise types live on the concrete
// `Kind<XReader, XBuilder>` wrapper, which is what callers actually hold.
export type AnyKind = Kind<any, any>
