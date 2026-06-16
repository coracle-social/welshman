import {Client as PomadeClient, PomadeSigner} from "@pomade/core"
import type {ClientOptions as PomadeClientOptions} from "@pomade/core"
import {writable} from "svelte/store"
import {randomId, append} from "@welshman/lib"
import {getPubkey} from "@welshman/util"
import {
  WrappedSigner,
  Nip46Broker,
  Nip46Signer,
  Nip07Signer,
  Nip01Signer,
  Nip55Signer,
} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {User} from "./user.js"
import type {UserOptions} from "./user.js"

/**
 * Session descriptors and the signer construction that turns them into a
 * `User`. In the old global package these fed a multi-account registry (a single
 * `sessions` map + `pubkey` pointer over one shared repository — the root of the
 * merged-DM bug). In the per-client model each session becomes its own `User`
 * (and thus its own `Client` with its own repository), so "multi-account" is
 * just "multiple clients" and lives above this module.
 */

export enum SessionMethod {
  Nip01 = "nip01",
  Nip07 = "nip07",
  Nip46 = "nip46",
  Nip55 = "nip55",
  Pomade = "pomade",
  Pubkey = "pubkey",
  Anonymous = "anonymous",
}

export type SessionNip01 = {
  method: SessionMethod.Nip01
  pubkey: string
  secret: string
}

export type SessionNip07 = {
  method: SessionMethod.Nip07
  pubkey: string
}

export type SessionNip46 = {
  method: SessionMethod.Nip46
  pubkey: string
  secret: string
  handler: {
    pubkey: string
    relays: string[]
  }
}

export type SessionNip55 = {
  method: SessionMethod.Nip55
  pubkey: string
  signer: string
}

export type SessionPomade = {
  method: SessionMethod.Pomade
  pubkey: string
  clientOptions: PomadeClientOptions
  email: string
}

export type SessionPubkey = {
  method: SessionMethod.Pubkey
  pubkey: string
}

export type SessionAnonymous = {
  method: SessionMethod.Anonymous
}

export type SessionAnyMethod =
  | SessionNip01
  | SessionNip07
  | SessionNip46
  | SessionNip55
  | SessionPomade
  | SessionPubkey
  | SessionAnonymous

export type Session = SessionAnyMethod & Record<string, any>

// Session factories

export const makeNip01Session = (secret: string): SessionNip01 => ({
  method: SessionMethod.Nip01,
  secret,
  pubkey: getPubkey(secret),
})

export const makeNip07Session = (pubkey: string): SessionNip07 => ({
  method: SessionMethod.Nip07,
  pubkey,
})

export const makeNip46Session = (
  pubkey: string,
  clientSecret: string,
  signerPubkey: string,
  relays: string[],
): SessionNip46 => ({
  method: SessionMethod.Nip46,
  pubkey,
  secret: clientSecret,
  handler: {pubkey: signerPubkey, relays},
})

export const makeNip55Session = (pubkey: string, signer: string): SessionNip55 => ({
  method: SessionMethod.Nip55,
  pubkey,
  signer,
})

export const makePomadeSession = (
  pubkey: string,
  email: string,
  clientOptions: PomadeClientOptions,
): SessionPomade => ({
  method: SessionMethod.Pomade,
  pubkey,
  clientOptions,
  email,
})

export const makePubkeySession = (pubkey: string): SessionPubkey => ({
  method: SessionMethod.Pubkey,
  pubkey,
})

// Type guards

export const isNip01Session = (session?: Session): session is SessionNip01 =>
  session?.method === SessionMethod.Nip01

export const isNip07Session = (session?: Session): session is SessionNip07 =>
  session?.method === SessionMethod.Nip07

export const isNip46Session = (session?: Session): session is SessionNip46 =>
  session?.method === SessionMethod.Nip46

export const isNip55Session = (session?: Session): session is SessionNip55 =>
  session?.method === SessionMethod.Nip55

export const isPomadeSession = (session?: Session): session is SessionPomade =>
  session?.method === SessionMethod.Pomade

export const isPubkeySession = (session?: Session): session is SessionPubkey =>
  session?.method === SessionMethod.Pubkey

// Signer construction

export const nip46Perms = "sign_event:22242,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt"

export type SignerLogEntry = {
  id: string
  method: string
  started_at: number
  finished_at?: number
  ok?: boolean
}

export const signerLog = writable<SignerLogEntry[]>([])

export const wrapSigner = (signer: ISigner) =>
  new WrappedSigner(signer, async <T>(method: string, thunk: () => Promise<T>) => {
    const id = randomId()

    signerLog.update(log => append({id, method, started_at: Date.now()}, log))

    try {
      const result = await thunk()

      signerLog.update(log =>
        log.map(x => (x.id === id ? {...x, finished_at: Date.now(), ok: true} : x)),
      )

      return result
    } catch (error: any) {
      signerLog.update(log =>
        log.map(x => (x.id === id ? {...x, finished_at: Date.now(), ok: false} : x)),
      )

      throw error
    }
  })

export const getSigner = (session?: Session): ISigner | undefined => {
  if (isNip07Session(session)) return wrapSigner(new Nip07Signer())
  if (isNip01Session(session)) return wrapSigner(new Nip01Signer(session.secret))
  if (isNip55Session(session)) return wrapSigner(new Nip55Signer(session.signer, session.pubkey))
  if (isPomadeSession(session))
    return wrapSigner(new PomadeSigner(new PomadeClient(session.clientOptions)))
  if (isNip46Session(session)) {
    const {
      secret: clientSecret,
      handler: {relays, pubkey: signerPubkey},
    } = session
    const broker = new Nip46Broker({clientSecret, signerPubkey, relays})

    return wrapSigner(new Nip46Signer(broker))
  }
}

/**
 * Build a `User` (pubkey + signer) from a session descriptor. Returns undefined
 * for sessions that can't sign (e.g. read-only Pubkey or Anonymous). Pass the
 * result to `new Client({user})` / `createApp({user})`.
 */
export const userFromSession = (session: Session, options: UserOptions = {}): User | undefined => {
  const signer = getSigner(session)

  return signer && typeof session.pubkey === "string"
    ? new User(session.pubkey, signer, options)
    : undefined
}

// Login helpers — each returns a User to build a client/app with

export const loginWithNip01 = (secret: string, options?: UserOptions) =>
  userFromSession(makeNip01Session(secret), options)

export const loginWithNip07 = (pubkey: string, options?: UserOptions) =>
  userFromSession(makeNip07Session(pubkey), options)

export const loginWithNip46 = (
  pubkey: string,
  clientSecret: string,
  signerPubkey: string,
  relays: string[],
  options?: UserOptions,
) => userFromSession(makeNip46Session(pubkey, clientSecret, signerPubkey, relays), options)

export const loginWithNip55 = (pubkey: string, signer: string, options?: UserOptions) =>
  userFromSession(makeNip55Session(pubkey, signer), options)

export const loginWithPomade = (
  pubkey: string,
  email: string,
  clientOptions: PomadeClientOptions,
  options?: UserOptions,
) => userFromSession(makePomadeSession(pubkey, email, clientOptions), options)
