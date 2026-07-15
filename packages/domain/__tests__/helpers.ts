import {stamp, prep, Resolver} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader, EventWriter, KindFactory} from "../src/index.js"

// By default tests resolve every route to no relays (in-tag hints become "",
// publish scenarios become empty).
const noopResolver = new Resolver(() => [])

// Marker urls a routing test can assert on: `markerResolver` maps each route type
// to one, so a resolved scenario reveals which sources a writer targets.
export const OUTBOX = "wss://outbox.test/"
export const INBOX = "wss://inbox.test/"
export const INDEX = "wss://index.test/"
export const SEEN = "wss://seen.test/"

export const markerResolver = new Resolver((route): string[] => {
  switch (route.type) {
    case "userOutbox":
      return [OUTBOX]
    case "pubkeyInbox":
      return [INBOX]
    case "index":
      return [INDEX]
    case "seen":
      return [SEEN]
    case "relay":
      return [route.url]
    default:
      return []
  }
})

// Bind a signer for encryption/routing at build time. Production binds the signer
// at `configure`; tests supply it at the build call instead, so set it on the
// writer's own (per-writer, freshly configured) context before rendering.
const withSigner = (writer: EventWriter<any>, signer?: ISigner) => {
  if (signer) writer.context.signer = signer

  return writer
}

// A writer's resolved publish relays, with the scenario limit lifted so nothing is
// dropped — for asserting on routing.
export const publishRelays = async (writer: EventWriter<any>) =>
  (await writer.scenario()).limit(100).getUrls()

// Parse an event into a reader (`fromEvent` awaits `parse`, so async work like
// list decryption is done before the reader is returned).
export const read = <R extends EventReader, W extends EventWriter<R>>(
  factory: KindFactory<R, W>,
  event: TrustedEvent,
  signer?: ISigner,
): Promise<R> => factory.configure({resolver: noopResolver, signer}).reader(event)

// A fresh writer, optionally seeded from a reader to edit its event. Pass a
// resolver (e.g. `markerResolver`) to route through recognizable urls.
export const write = <R extends EventReader, W extends EventWriter<R>>(
  factory: KindFactory<R, W>,
  reader?: R,
  resolver: Resolver = noopResolver,
): W => factory.configure({resolver}).writer(reader)

// The unsigned event template a writer produces.
export const buildTemplate = (writer: EventWriter<any>, signer?: ISigner) =>
  withSigner(writer, signer).renderTemplate()

// A signed event.
export const buildEvent = async (writer: EventWriter<any>, signer: ISigner) =>
  signer.sign(stamp(await withSigner(writer, signer).renderTemplate()))

// A hashed rumor.
export const buildRumor = async (writer: EventWriter<any>, signer: ISigner) =>
  prep(await withSigner(writer, signer).renderTemplate(), await signer.getPubkey())
