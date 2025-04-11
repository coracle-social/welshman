import {derived} from "svelte/store"
import {cached, hash, omit, equals, assoc} from "@welshman/lib"
import {withGetter, synced} from "@welshman/store"
import {Nip46Broker, Nip46Signer, Nip07Signer, Nip01Signer, Nip55Signer, getPubkey} from "@welshman/signer"

export enum SessionMethod {
  Nip01 = 'nip01',
  Nip07 = 'nip07',
  Nip46 = 'nip46',
  Nip55 = 'nip55',
  Pubkey = 'pubkey',
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

export type SessionPubkey = {
  method: SessionMethod.Pubkey
  pubkey: string
}

export type SessionAnyMethod =
  | SessionNip01
  | SessionNip07
  | SessionNip46
  | SessionNip55
  | SessionPubkey

export type Session = SessionAnyMethod & Record<string, any>

export const pubkey = withGetter(synced<string | undefined>("pubkey", undefined))

export const sessions = withGetter(synced<Record<string, Session>>("sessions", {}))

export const session = withGetter(
  derived([pubkey, sessions], ([$pubkey, $sessions]) => ($pubkey ? $sessions[$pubkey] : null)),
)

export const getSession = (pubkey: string) => sessions.get()[pubkey]

export const addSession = (session: Session) => {
  sessions.update(assoc(session.pubkey, session))
  pubkey.set(session.pubkey)
}

export const putSession = (session: Session) => {
  if (!equals(getSession(session.pubkey), session)) {
    sessions.update(assoc(session.pubkey, session))
  }
}

export const updateSession = (pubkey: string, f: (session: Session) => Session) =>
  putSession(f(getSession(pubkey)))

export const dropSession = (_pubkey: string) => {
  pubkey.update($pubkey => $pubkey === _pubkey ? undefined : $pubkey)
  sessions.update($sessions => omit([_pubkey], $sessions))
}

export const clearSessions = () => {
  pubkey.set(undefined)
  sessions.set({})
}

// Session factories

export const makeNip01Session = (secret: string): SessionNip01 =>
  ({method: SessionMethod.Nip01, secret, pubkey: getPubkey(secret)})

export const makeNip07Session = (pubkey: string): SessionNip07 =>
  ({method: SessionMethod.Nip07, pubkey})

export const makeNip46Session = (pubkey: string, clientSecret: string, signerPubkey: string, relays: string[]): SessionNip46 =>
  ({method: SessionMethod.Nip46, pubkey, secret: clientSecret, handler: {pubkey: signerPubkey, relays}})

export const makeNip55Session = (pubkey: string, signer: string): SessionNip55 =>
  ({method: SessionMethod.Nip55, pubkey, signer})

export const makePubkeySession = (pubkey: string): SessionPubkey =>
  ({method: SessionMethod.Pubkey, pubkey})

// Login utilities

export const loginWithNip01 = (secret: string) =>
  addSession(makeNip01Session(secret))

export const loginWithNip07 = (pubkey: string) =>
  addSession(makeNip07Session(pubkey))

export const loginWithNip46 = (pubkey: string, clientSecret: string, signerPubkey: string, relays: string[]) =>
  addSession(makeNip46Session(pubkey, clientSecret, signerPubkey, relays))

export const loginWithNip55 = (pubkey: string, signer: string) =>
  addSession(makeNip55Session(pubkey, signer))

export const loginWithPubkey = (pubkey: string) =>
  addSession(makePubkeySession(pubkey))

// Other stuff

export const nip46Perms = "sign_event:22242,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt"

export const getSigner = cached({
  maxSize: 100,
  getKey: ([session]: [Session | null]) => hash(String(JSON.stringify(session))),
  getValue: ([session]: [Session | null]) => {
    switch (session?.method) {
      case "nip07":
        return new Nip07Signer()
      case "nip01":
        return new Nip01Signer(session.secret!)
      case "nip46":
        return new Nip46Signer(
          Nip46Broker.get({
            clientSecret: session.secret!,
            relays: session.handler!.relays,
            signerPubkey: session.handler!.pubkey,
          }),
        )
      case "nip55":
        return new Nip55Signer(session.signer!)
      default:
        return null
    }
  },
})

export const signer = withGetter(derived(session, getSigner))

export const nip44EncryptToSelf = (payload: string) => {
  const $pubkey = pubkey.get()
  const $signer = signer.get()

  if (!$signer) {
    throw new Error("Unable to encrypt to self without valid signer")
  }

  return $signer.nip44.encrypt($pubkey!, payload)
}
