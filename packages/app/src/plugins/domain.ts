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
  // is stable for the app's lifetime. The domain guards against a missing signer.
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
          get signer() {
            return app.user?.signer
          },
        })),
      )
    }

    return configured
  }

  reader = <R extends EventReader, W extends EventWriter<R>>(factory: KindFactory<R, W>) =>
    this.configure(factory).reader

  writer = <R extends EventReader, W extends EventWriter<R>>(
    factory: KindFactory<R, W>,
    reader?: R,
  ): W => this.configure(factory).writer(reader)

  command = async (writer: EventWriter<any>): Promise<Command> => {
    User.require(this.app)

    const {event, relays} = await writer.render()

    return new Command(this.app, event, relays)
  }
}
