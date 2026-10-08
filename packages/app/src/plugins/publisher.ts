import type {Subscriber} from "svelte/store"
import {get, writable} from "svelte/store"
import {append, TaskQueue, ensurePlural, remove, defer, sleep, now, uniq} from "@welshman/lib"
import {
  HashedEvent,
  EventTemplate,
  SignedEvent,
  isSignedEvent,
  WRAPPED_KINDS,
  prep,
  makePow,
} from "@welshman/util"
import {PublishStatus, PublishResult, PublishResultsByRelay} from "@welshman/net"
import {ISigner, Nip01Signer, Nip59} from "@welshman/signer"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {User} from "../user.js"

/** What the caller asked for. A retry rebuilds from it and the publication's current event. */
export type PublishRequest = {
  event: EventTemplate
  relays: string[]
  recipient?: string
  delay?: number
  pow?: number
  priority?: number
  timeout?: number
}

/** A publication's place in the pipeline. Every terminal state has a result for each relay. */
export type PublicationState =
  | {stage: "queued"}
  | {stage: "delayed"; until: number}
  | {stage: "wrapping"}
  | {stage: "pow"; difficulty: number}
  | {stage: "signing"}
  | {stage: "sending"; results: PublishResultsByRelay}
  | {stage: "sent"; results: PublishResultsByRelay}
  | {stage: "failed"; error: string; results: PublishResultsByRelay}
  | {stage: "aborted"; results: PublishResultsByRelay}

export type PublicationStage = PublicationState["stage"]

export const TERMINAL_STAGES: PublicationStage[] = ["sent", "failed", "aborted"]

const {Pending, Success, Failure, Timeout, Aborted} = PublishStatus

const resultsFor = (relays: string[], status: PublishStatus, detail: string) => {
  const results: PublishResultsByRelay = {}

  for (const relay of relays) {
    results[relay] = {relay, status, detail}
  }

  return results
}

/** Status queries over per-relay results. A relay with no result is still in progress. */
export abstract class PublishStatusView {
  abstract readonly relays: string[]
  abstract readonly results: PublishResultsByRelay

  abstract isComplete(): boolean

  abstract abort(): void

  private _subs: Subscriber<this>[] = []

  // A settled view never changes again, so its subscribers aren't kept.
  subscribe(subscriber: Subscriber<this>) {
    subscriber(this)

    if (!this.isComplete()) {
      this._subs.push(subscriber)
    }

    return () => {
      this._subs = remove(subscriber, this._subs)
    }
  }

  protected notify() {
    for (const subscriber of this._subs) {
      subscriber(this)
    }

    if (this.isComplete()) {
      this._subs = []
    }
  }

  getUrlsWithStatus(statuses: PublishStatus | PublishStatus[]) {
    const matches = ensurePlural(statuses)

    return this.relays.filter(relay => {
      const result = this.results[relay]

      return result !== undefined && matches.includes(result.status)
    })
  }

  getCompleteUrls() {
    return this.getUrlsWithStatus([Success, Failure, Timeout, Aborted])
  }

  getIncompleteUrls() {
    return this.relays.filter(relay => [undefined, Pending].includes(this.results[relay]?.status))
  }

  getFailedUrls() {
    return this.getUrlsWithStatus([Failure, Timeout])
  }

  hasStatus(statuses: PublishStatus | PublishStatus[]) {
    return this.getUrlsWithStatus(statuses).length > 0
  }

  // Nothing has reached a relay yet, so aborting still undoes the publish entirely.
  canAbort() {
    return this.relays.some(relay => this.results[relay] === undefined)
  }

  getError() {
    return this.relays.map(relay => this.results[relay]).find(result => result?.status === Failure)
      ?.detail
  }
}

/** One event on its way to a set of relays. The `Publisher` moves it with `advance`. */
export class Publication extends PublishStatusView {
  state: PublicationState = {stage: "queued"}

  // Mined and signed as the pipeline runs. For a gift wrap, this is the rumor inside `wrap`.
  event: HashedEvent

  wrap?: HashedEvent

  readonly controller = new AbortController()

  private _settled = defer<this>()

  constructor(
    readonly request: PublishRequest,
    event: HashedEvent,
  ) {
    super()

    this.event = event
  }

  get relays() {
    return this.request.relays
  }

  get results() {
    return "results" in this.state ? this.state.results : {}
  }

  get signal() {
    return this.controller.signal
  }

  isComplete() {
    return TERMINAL_STAGES.includes(this.state.stage)
  }

  advance(state: PublicationState, draft?: {event: HashedEvent; wrap?: HashedEvent}) {
    if (!this.isComplete()) {
      this.state = state

      if (draft) {
        this.event = draft.event
        this.wrap = draft.wrap
      }

      this.notify()

      if (this.isComplete()) {
        this._settled.resolve(this)
      }
    }
  }

  // Relays that already answered keep their result.
  abort() {
    const results = resultsFor(this.relays, Aborted, "aborted")

    for (const relay of this.relays) {
      const result = this.results[relay]

      if (result && result.status !== Pending) {
        results[relay] = result
      }
    }

    this.advance({stage: "aborted", results})
    this.controller.abort()
  }

  settled() {
    return this._settled
  }
}

// Pending first, then the worst outcome, so a relay succeeds only when every publication did.
const MERGE_PRECEDENCE = [Pending, Failure, Timeout, Aborted, Success]

export const mergeResults = (publications: Publication[]) => {
  const results: PublishResultsByRelay = {}
  const rank = (result: PublishResult) => MERGE_PRECEDENCE.indexOf(result.status)

  for (const relay of uniq(publications.flatMap(p => p.relays))) {
    const sending = publications.filter(p => p.relays.includes(relay))
    const answered = sending
      .map(p => p.results[relay])
      .filter((result): result is PublishResult => result !== undefined)

    if (answered.length === sending.length) {
      results[relay] = answered.reduce((a, b) => (rank(b) < rank(a) ? b : a))
    }
  }

  return results
}

/** Several publications watched as one, e.g. a rumor gift-wrapped for each recipient. */
export class PublicationGroup extends PublishStatusView {
  constructor(readonly publications: Publication[]) {
    super()

    for (const publication of publications) {
      publication.subscribe(() => this.notify())
    }
  }

  get relays() {
    return uniq(this.publications.flatMap(p => p.relays))
  }

  get results() {
    return mergeResults(this.publications)
  }

  isComplete() {
    return this.publications.every(p => p.isComplete())
  }

  abort() {
    this.publications.forEach(p => p.abort())
  }

  async settled() {
    await Promise.all(this.publications.map(p => p.settled()))

    return this
  }
}

export type Publishable = Publication | PublicationGroup

// Stages return a new draft, and the publication takes it on the next `enter`.
type Draft = {
  event: HashedEvent
  wrap?: HashedEvent
  wrapper?: ISigner
}

type StageContext = {
  app: IApp
  publication: Publication
  enter: (state: PublicationState) => void
}

type Stage = (draft: Draft, ctx: StageContext) => Promise<Draft>

// A remote signer can otherwise hang the publication indefinitely.
const SIGN_TIMEOUT = 30_000

// Aborting the publication also withdraws its requests from the signer's queue.
const signerOptions = (publication: Publication) => ({
  signal: AbortSignal.any([publication.signal, AbortSignal.timeout(SIGN_TIMEOUT)]),
})

// The soft-undo window comes before anything is signed.
const delayStage: Stage = async (draft, {publication, enter}) => {
  const {delay} = publication.request

  if (delay) {
    enter({stage: "delayed", until: now() + delay / 1000})

    await Promise.race([
      sleep(delay),
      new Promise(resolve => publication.signal.addEventListener("abort", resolve, {once: true})),
    ])
  }

  return draft
}

// The user signs the seal, and a throwaway key signs the wrap.
const wrapStage: Stage = async (draft, {app, publication, enter}) => {
  const {recipient} = publication.request
  let result = draft

  if (recipient) {
    enter({stage: "wrapping"})

    const wrapper = Nip01Signer.ephemeral()
    const nip59 = new Nip59(User.require(app).signer, wrapper)

    result = {
      ...draft,
      wrapper,
      wrap: await nip59.wrap(recipient, draft.event, [], signerOptions(publication)),
    }
  }

  return result
}

// Relays receive the wrap rather than the rumor, so the wrap is what gets mined.
const powStage: Stage = async (draft, {publication, enter}) => {
  const {pow} = publication.request
  const target = draft.wrap ?? draft.event
  let result = draft

  if (pow && (draft.wrap || !isSignedEvent(target))) {
    enter({stage: "pow", difficulty: pow})

    // Mining re-hashes, so it starts from the owned fields and leaves any id or signature behind.
    const {kind, tags, content, created_at, pubkey} = target
    const mined = await makePow({kind, tags, content, created_at, pubkey}, pow).result

    result = draft.wrap ? {...draft, wrap: mined} : {...draft, event: mined}
  }

  return result
}

const signStage: Stage = async (draft, {app, publication, enter}) => {
  const options = signerOptions(publication)
  let result = draft

  if (draft.wrap && draft.wrapper && !isSignedEvent(draft.wrap)) {
    result = {...draft, wrap: await draft.wrapper.sign(draft.wrap, options)}
  }

  if (!draft.wrap && !isSignedEvent(draft.event)) {
    enter({stage: "signing"})

    result = {...draft, event: await User.require(app).sign(draft.event, options)}
  }

  return result
}

const sendStage: Stage = async (draft, {app, publication, enter}) => {
  const {relays, priority, timeout} = publication.request
  let results = resultsFor(relays, Pending, "")

  const update = (result: PublishResult) => {
    results = {...results, [result.relay]: result}
    enter({stage: "sending", results})
  }

  const event = draft.wrap ?? draft.event

  if (!isSignedEvent(event)) {
    throw new Error("Attempted to send an unsigned event")
  }

  enter({stage: "sending", results})

  await app.use(Network).publish({
    event,
    relays,
    priority,
    timeout,
    signal: publication.signal,
    onPending: update,
    onSuccess: update,
    onFailure: update,
    onTimeout: update,
    onAborted: update,
  })

  enter({stage: "sent", results})

  return draft
}

export const STAGES: Stage[] = [delayStage, wrapStage, powStage, signStage, sendStage]

/** Per-app publish pipeline, reached via `app.use(Publisher)`. */
export class Publisher {
  history = writable<Publication[]>([])

  // Paces how fast publications enter the pipeline.
  queue = new TaskQueue<Publication>({
    batchSize: 10,
    batchDelay: 100,
    processItem: (publication: Publication) => {
      this.run(publication)
    },
  })

  constructor(readonly app: IApp) {
    app.onCleanup(() => {
      this.queue.clear()

      // Stops in-flight publishes and unwinds their optimistic writes.
      for (const publication of get(this.history)) {
        publication.abort()
      }
    })
  }

  publish = (request: PublishRequest) => {
    if (!request.recipient && WRAPPED_KINDS.includes(request.event.kind)) {
      throw new Error(`Attempted to publish a kind ${request.event.kind} without wrapping it`)
    }

    const event = prep(request.event, User.require(this.app).pubkey)
    const publication = new Publication(request, event)

    this.observe(publication)
    this.history.update($history => append(publication, $history))
    this.queue.push(publication)

    return publication
  }

  // `relays` narrows the retry, e.g. to the ones that failed. The event keeps its id, and the
  // attempts it replaces leave `history`, so a view of the event only sees the current ones.
  retry(target: Publication, relays?: string[]): Publication
  retry(target: PublicationGroup, relays?: string[]): PublicationGroup
  // Callers can't see the implementation signature below, so the union needs its own overload.
  retry(target: Publishable, relays?: string[]): Publishable
  retry(target: Publishable, relays?: string[]): Publishable {
    const targets = (p: Publication) =>
      relays ? p.relays.filter(r => relays.includes(r)) : p.relays
    const replaced =
      target instanceof PublicationGroup
        ? target.publications.filter(p => targets(p).length > 0)
        : [target]

    this.history.update($history => $history.filter(p => !replaced.includes(p)))

    const retried = replaced.map(p =>
      this.publish({...p.request, event: p.event, relays: targets(p)}),
    )

    return target instanceof PublicationGroup ? new PublicationGroup(retried) : retried[0]
  }

  merge(items: Publishable[]) {
    return new PublicationGroup(
      items.flatMap(p => (p instanceof PublicationGroup ? p.publications : [p])),
    )
  }

  private async run(publication: Publication) {
    const ctx = {app: this.app, publication}
    let draft: Draft = {event: publication.event}

    try {
      for (const stage of STAGES) {
        if (!publication.isComplete()) {
          draft = await stage(draft, {...ctx, enter: state => publication.advance(state, draft)})
        }
      }
    } catch (e) {
      const error = String(e || "Failed to publish event")

      console.error("Failed to publish event", e)
      publication.advance({
        stage: "failed",
        error,
        results: resultsFor(publication.relays, Failure, error),
      })
    }
  }

  private observe(publication: Publication) {
    const {repository, tracker, wrapManager} = this.app
    const {recipient} = publication.request
    let current = publication.event
    let registeredWrap: SignedEvent | undefined

    for (const url of publication.relays) {
      tracker.track(current.id, url)
    }

    repository.publish(current)

    publication.subscribe(({state, event, wrap}) => {
      // Only pow changes the id. A signature on the same id is taken in place.
      if (event.id !== current.id) {
        for (const url of publication.relays) {
          tracker.removeRelay(current.id, url)
          tracker.track(event.id, url)
        }

        repository.removeEvent(current.id)
      }

      if (event !== current) {
        repository.publish(event)
        current = event
      }

      if (
        recipient &&
        wrap &&
        isSignedEvent(wrap) &&
        state.stage === "sending" &&
        !registeredWrap
      ) {
        registeredWrap = wrap
        wrapManager.add({recipient, wrap, rumor: event})
      }

      if ("results" in state) {
        for (const {relay, status} of Object.values(state.results)) {
          if (![Pending, Success].includes(status)) {
            tracker.removeRelay(current.id, relay)
          }
        }
      }

      if (state.stage === "aborted") {
        if (registeredWrap) {
          wrapManager.remove(registeredWrap.id)
        }

        repository.removeEvent(current.id)
        this.history.update($history => remove(publication, $history))
      }
    })
  }
}
