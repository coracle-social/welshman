import type {TrustedEvent, Resolver} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader} from "./EventReader.js"
import type {EventWriter} from "./EventWriter.js"

export type KindContext = {
  resolver: Resolver
  signer?: ISigner
}

export type KindConfig<Reader extends EventReader, Writer extends EventWriter<Reader>> = {
  kind: number
  reader: new (kind: number, context: KindContext, event: TrustedEvent) => Reader
  writer: new (kind: number, context: KindContext, reader?: Reader) => Writer
}

/**
 * Bundles a kind's number, reader, and writer classes.
 *
 * Usage: `export const Profile = new KindFactory({kind: PROFILE, reader:
 * ProfileReader, writer: ProfileWriter})`, then `Profile.kind` reads the number and
 * `Profile.configure(context)` binds the app's dependencies once.
 */
export class KindFactory<Reader extends EventReader, Writer extends EventWriter<Reader>> {
  constructor(readonly config: KindConfig<Reader, Writer>) {}

  get kind(): number {
    return this.config.kind
  }

  configure(context: KindContext): ConfiguredKind<Reader, Writer> {
    return new ConfiguredKind(this.config, context)
  }
}

/**
 * A kind bound to a `KindContext`. Produces readers and writers which share the
 * configured dependencies.
 */
export class ConfiguredKind<Reader extends EventReader, Writer extends EventWriter<Reader>> {
  constructor(
    readonly config: KindConfig<Reader, Writer>,
    readonly context: KindContext,
  ) {}

  get kind(): number {
    return this.config.kind
  }

  // Build a reader for an existing event, awaiting `parse` (decryption, etc.).
  reader = async (event: TrustedEvent): Promise<Reader> => {
    const reader = new this.config.reader(this.config.kind, this.context, event)

    await reader.parse()

    return reader
  }

  // Build a writer. Pass a reader to edit its event, or omit to draft a new one.
  writer = (reader?: Reader): Writer =>
    new this.config.writer(this.config.kind, this.context, reader)
}
