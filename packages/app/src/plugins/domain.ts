import type {TrustedEvent} from "@welshman/util"
import type {
  BaseEventReader,
  EventWriter,
  EventQuery,
  KindFactory,
  ConfiguredKind,
  Parsed,
} from "@welshman/domain"
import {Router} from "./router.js"
import {Command} from "../command.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Binds the app's dependencies to `@welshman/domain` kinds.
 */
export class Domain {
  constructor(readonly app: IApp) {}

  private configured = new Map<KindFactory<any, any, any>, ConfiguredKind<any, any, any>>()

  // Configure a kind, memoized per factory. The signer is resolved lazily — app
  // policies can swap it (via `wrapSigner`) after construction — while the resolver
  // is stable for the app's lifetime. The domain guards against a missing signer.
  configure = <R extends BaseEventReader, W extends EventWriter<R>, Q extends EventQuery>(
    factory: KindFactory<R, W, Q>,
  ): ConfiguredKind<R, W, Q> => {
    let configured = this.configured.get(factory) as ConfiguredKind<R, W, Q> | undefined

    if (!configured) {
      const {app} = this

      this.configured.set(
        factory,
        (configured = factory.configure({
          resolver: app.use(Router).resolver,
          get signer() {
            return app.user?.signer
          },
        })),
      )
    }

    return configured
  }

  // An event-to-reader function for a kind, parsed and ready to use. The result is
  // the reader itself for kinds that parse synchronously and a promise of it for
  // kinds that decrypt, which is exactly what `EventToItem` accepts — so
  // collections keep their sync path where the kind allows one.
  reader =
    <R extends BaseEventReader, W extends EventWriter<R>, Q extends EventQuery>(
      factory: KindFactory<R, W, Q>,
    ) =>
    (event: TrustedEvent): Parsed<R> =>
      this.configure(factory).reader(event).parse() as Parsed<R>

  writer = <R extends BaseEventReader, W extends EventWriter<R>, Q extends EventQuery>(
    factory: KindFactory<R, W, Q>,
    reader?: R,
  ): W => this.configure(factory).writer(reader)

  // A query for a kind, ready to have its filter parts set. Finish with
  // `render()` for the filters plus the relays to request them from.
  query = <R extends BaseEventReader, W extends EventWriter<R>, Q extends EventQuery>(
    factory: KindFactory<R, W, Q>,
  ): Q => this.configure(factory).query()

  command = async (writer: EventWriter<any>): Promise<Command> => {
    User.require(this.app)

    const {event, relays} = await writer.render()

    return new Command(this.app, event, relays)
  }
}
