import type {TrustedEvent, Resolver} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {BaseEventReader} from "./EventReader.js"
import type {EventWriter} from "./EventWriter.js"
import type {EventQuery} from "./EventQuery.js"

export type KindContext = {
  resolver: Resolver
  signer?: ISigner
}

export type KindConfig<
  Reader extends BaseEventReader,
  Writer extends EventWriter<Reader>,
  Query extends EventQuery,
> = {
  kind: number
  reader: new (kind: number, context: KindContext, event: TrustedEvent) => Reader
  writer: new (kind: number, context: KindContext, reader?: Reader) => Writer
  query: new (kind: number, context: KindContext) => Query
}

/**
 * Bundles a kind's number, reader, writer, and query classes.
 *
 * Usage: `export const Profile = new KindFactory({kind: PROFILE, reader:
 * ProfileReader, writer: ProfileWriter, query: ProfileQuery})`, then `Profile.kind`
 * reads the number and `Profile.configure(context)` binds the app's dependencies once.
 */
export class KindFactory<
  Reader extends BaseEventReader,
  Writer extends EventWriter<Reader>,
  Query extends EventQuery,
> {
  constructor(readonly config: KindConfig<Reader, Writer, Query>) {}

  get kind(): number {
    return this.config.kind
  }

  configure(context: KindContext): ConfiguredKind<Reader, Writer, Query> {
    return new ConfiguredKind(this.config, context)
  }
}

/**
 * A kind bound to a `KindContext`. Produces readers, writers, and queries which
 * share the configured dependencies.
 */
export class ConfiguredKind<
  Reader extends BaseEventReader,
  Writer extends EventWriter<Reader>,
  Query extends EventQuery,
> {
  constructor(
    readonly config: KindConfig<Reader, Writer, Query>,
    readonly context: KindContext,
  ) {}

  get kind(): number {
    return this.config.kind
  }

  // Build a reader for an existing event. It arrives unparsed — chain `parse()`,
  // which returns the reader for sync kinds and a promise of it for kinds that
  // decrypt. `await kind.reader(event).parse()` is correct for either.
  reader = (event: TrustedEvent): Reader =>
    new this.config.reader(this.config.kind, this.context, event)

  // Build a writer. Pass a reader to edit its event, or omit to draft a new one.
  writer = (reader?: Reader): Writer =>
    new this.config.writer(this.config.kind, this.context, reader)

  // Build a query. Its setters build up a filter; `render()` returns it along with
  // the relays to request it from.
  query = (): Query => new this.config.query(this.config.kind, this.context)
}
