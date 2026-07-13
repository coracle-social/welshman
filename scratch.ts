abstract class EventRouter<R extends EventReader = EventReader, W extends EventWriter = EventWriter> {
  constructor(private def: AnyConfiguredKind, private _routes: RelaySelection) {}

  routes() {
    return this._routes
  }

  scenario() {
    return resolve(this.def.context.resolver, this._routes, this.def.context.scenarioOptions)
  }

  relays() {
    return this.scenario().getUrls()
  }

  static fromWriter(writer: W) {}
  static fromReader(writer: R) {}
  static fromFilter(filter: Filter) {}
}
