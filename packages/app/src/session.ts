import {derived} from "svelte/store"
import {cached, hash, omit, equals, assoc} from "@welshman/lib"
import {withGetter, synced} from "@welshman/store"
import {Nip46Broker, Nip46Signer, Nip07Signer, Nip01Signer, Nip55Signer} from "@welshman/signer"

export type SessionNip01 = {
  method: "nip01"
  pubkey: string
  secret: string
}

export type SessionNip07 = {
  method: "nip07"
  pubkey: string
}

export type SessionNip46 = {
  method: "nip46"
  pubkey: string
  secret: string
  handler: {
    pubkey: string
    relays: string[]
  }
}

export type SessionNip55 = {
  method: "nip55"
  pubkey: string
  signer: string
}

export type SessionPubkey = {
  method: "pubkey"
  pubkey: string
}

export type SessionAnyMethod =
  | SessionNip01
  | SessionNip07
  | SessionNip46
  | SessionNip55
  | SessionPubkey

export type Session = SessionAnyMethod & Record<string, any>

export const pubkey = withGetter(synced<string | null>("pubkey", null))

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

export const dropSession = (pubkey: string) =>
  sessions.update($sessions => omit([pubkey], $sessions))

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
