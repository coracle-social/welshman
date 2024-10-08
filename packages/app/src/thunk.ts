import {writable, get} from 'svelte/store'
import {Worker, assoc} from '@welshman/lib'
import {stamp, own, hash} from "@welshman/signer"
import type {TrustedEvent, HashedEvent, EventTemplate, SignedEvent, StampedEvent, OwnedEvent} from '@welshman/util'
import {isStampedEvent, isOwnedEvent, isHashedEvent, isUnwrappedEvent, isSignedEvent} from '@welshman/util'
import {publish, PublishStatus} from "@welshman/net"
import {repository, tracker} from './core'
import {pubkey, getSession, getSigner} from './session'

export type PublishStatusData = {
  id: string
  url: string
  message: string
  status: PublishStatus
}

export type PublishStatusDataByUrl = Record<string, PublishStatusData>

export type PublishStatusDataByUrlById = Record<string, PublishStatusDataByUrl>

export const publishStatusData = writable<PublishStatusDataByUrlById>({})

export type Thunk = {
  event: TrustedEvent
  relays: string[]
}

export type ThunkWithResolve = Thunk & {
  resolve: (data: PublishStatusDataByUrl) => void
}

export const thunkWorker = new Worker<ThunkWithResolve>()

thunkWorker.addGlobalHandler(async ({event, relays, resolve}: ThunkWithResolve) => {
  // If we were given a wrapped event, make sure to publish the wrapper, not the rumor
  if (isUnwrappedEvent(event)) {
    event = event.wrap
  }

  // If the event was already signed, leave it alone. Otherwise, sign it now. This is to
  // decrease apparent latency in the UI that results from waiting for remote signers
  if (!isSignedEvent(event)) {
    const signer = getSigner(getSession(event.pubkey))

    if (!signer) {
      return console.warn(`No signer found for ${event.pubkey}`)
    }

    event = await signer.sign(event)
  }

  // We're guaranteed to have a signed event at this point
  const signedEvent = event as SignedEvent
  const {id, sig} = signedEvent

  // Send it off
  const pub = publish({event: signedEvent, relays})

  // Copy the signature over since we had deferred it
  const savedEvent = repository.getEvent(id) as SignedEvent

  // The event may already be replaced or deleted
  if (savedEvent) {
    savedEvent.sig = sig
  }

  // Track publish success
  const statusByUrl: PublishStatusDataByUrl = {}

  pub.emitter.on("*", (status: PublishStatus, url: string, message: string) => {
    Object.assign(statusByUrl, {[url]: {id, url, status, message}})

    publishStatusData.update(assoc(id, statusByUrl))

    if (status === PublishStatus.Success) {
      tracker.track(id, url)
    }

    if (
      Object.values(statusByUrl).filter(s => s.status !== PublishStatus.Pending).length ===
      relays.length
    ) {
      resolve(statusByUrl)
    }
  })
})

export type ThunkEvent = EventTemplate | StampedEvent | OwnedEvent | TrustedEvent

export const prepEvent = (event: ThunkEvent) => {
  if (!isStampedEvent(event as StampedEvent)) {
    event = stamp(event)
  }

  if (!isOwnedEvent(event as OwnedEvent)) {
    event = own(event as StampedEvent, get(pubkey)!)
  }

  if (!isHashedEvent(event as HashedEvent)) {
    event = hash(event as OwnedEvent)
  }

  return event as TrustedEvent
}

export const makeThunk = ({event, relays}: {event: ThunkEvent, relays: string[]}) =>
  ({event, relays})

export const publishThunk = ({event, relays}: Thunk) =>
  new Promise<PublishStatusDataByUrl>(resolve => {
    event = prepEvent(event)

    thunkWorker.push({event, relays, resolve})
    repository.publish(event)
  })
