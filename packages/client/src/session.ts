import {Client as PomadeClient, PomadeSigner} from "@pomade/core"
import type {ClientOptions as PomadeClientOptions} from "@pomade/core"
import type {MaybeAsync} from "@welshman/lib"
import {Nip46Broker, Nip46Signer, Nip07Signer, Nip01Signer, Nip55Signer} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"

// ── Sessions: serializable {method, data} descriptors ──

export type Session<M extends string = string, D = unknown> = {
  method: M
  data: D
}

// ── Session handlers: a method string, its data shape, and how to build a signer ──

export type SessionHandler<M extends string, D> = {
  method: M
  getSigner: (data: D) => MaybeAsync<ISigner>
}

/**
 * Define a session handler. `M` and `D` are inferred from the arguments, so
 * `getSigner` is type-checked against the data shape — and the same handler is
 * used to build typed sessions (`toSession`) and to reconstruct signers.
 */
export const defineSessionHandler = <M extends string, D>(handler: SessionHandler<M, D>) => handler

/** Build a typed, serializable session from a handler and its data. */
export const toSession = <M extends string, D>(
  handler: SessionHandler<M, D>,
  data: D,
): Session<M, D> => ({method: handler.method, data})

// ── Built-in handlers ──

export const nip01 = defineSessionHandler({
  method: "nip01",
  getSigner: (data: {secret: string}) => new Nip01Signer(data.secret),
})

export const nip07 = defineSessionHandler({
  method: "nip07",
  getSigner: (_data: Record<string, never>) => new Nip07Signer(),
})

export const nip46 = defineSessionHandler({
  method: "nip46",
  getSigner: (data: {clientSecret: string; signerPubkey: string; relays: string[]}) =>
    new Nip46Signer(new Nip46Broker(data)),
})

export const nip55 = defineSessionHandler({
  method: "nip55",
  getSigner: (data: {pubkey: string; signer: string}) => new Nip55Signer(data.signer, data.pubkey),
})

export const pomade = defineSessionHandler({
  method: "pomade",
  getSigner: (data: {clientOptions: PomadeClientOptions; email: string}) =>
    new PomadeSigner(new PomadeClient(data.clientOptions)),
})

// ── Registry: deserialize a stored session back into a signer ──

export const sessionHandlers = new Map<string, SessionHandler<string, any>>()

export const registerSessionHandler = (handler: SessionHandler<string, any>) => {
  sessionHandlers.set(handler.method, handler)
}

export const unregisterSessionHandler = (handler: SessionHandler<string, any>) => {
  sessionHandlers.delete(handler.method)
}

export const getSignerFromSession = (session: Session): MaybeAsync<ISigner> | undefined =>
  sessionHandlers.get(session.method)?.getSigner(session.data)

// ── Initialize default session handlers ──

for (const sessionHandler of [nip01, nip07, nip46, nip55, pomade]) {
  registerSessionHandler(sessionHandler)
}
