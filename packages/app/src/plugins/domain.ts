import type {EventReader, EventWriter, KindFactory, ConfiguredKind} from "@welshman/domain"
import {Router} from "./router.js"
import {Command} from "../command.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Binds the app's dependencies to `@welshman/domain` kinds.
 */
export class Domain {
  constructor(readonly app: IApp) {}

  private configured = new Map<KindFactory<any, any>, ConfiguredKind<any, any>>()

  // Configure a kind, memoized per factory. The signer is resolved lazily — app
  // policies can swap it (via `wrapSigner`) after construction — while the resolver
  // and repository are stable for the app's lifetime. The Router's `Resolver`
  // dereferences routes; callers tune the scenario (limit, etc.) via
  // `writer.scenario()`. The repository lets routers locate event parents.
  configure = <R extends EventReader, W extends EventWriter<R>>(
    factory: KindFactory<R, W>,
  ): ConfiguredKind<R, W> => {
    let configured = this.configured.get(factory) as ConfiguredKind<R, W> | undefined

    if (!configured) {
      const {app} = this

      this.configured.set(
        factory,
        (configured = factory.configure({
          resolver: app.use(Router).resolver,
          repository: app.repository,
          get signer() {
            return app.user?.signer
          },
        })),
      )
    }

    return configured
  }

  // Parse events of this kind into readers — pass as an event decoder (`eventToItem`).
  reader = <R extends EventReader, W extends EventWriter<R>>(factory: KindFactory<R, W>) =>
    this.configure(factory).reader

  // A fresh writer, optionally seeded from a reader.
  writer = <R extends EventReader, W extends EventWriter<R>>(
    factory: KindFactory<R, W>,
    reader?: R,
  ): W => this.configure(factory).writer(reader)

  // Finalize a writer (as the required app user) into a publishable `Command`.
  command = async (writer: EventWriter<any>): Promise<Command> => {
    User.require(this.app)

    const {event, relays} = await writer.finalize()

    return new Command(this.app, event, relays)
  }
}
