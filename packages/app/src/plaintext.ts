import {writable} from 'svelte/store'
import {assoc} from '@welshman/lib'
import type {TrustedEvent} from '@welshman/util'
import {withGetter} from '@welshman/store'
import {decrypt} from "@welshman/signer"
import {getSigner, getSession} from './session'

export const plaintext = withGetter(writable<Record<string, string>>({}))

export const getPlaintext = (e: TrustedEvent) => plaintext.get()[e.id]

export const setPlaintext = (e: TrustedEvent, content: string) =>
  plaintext.update(assoc(e.id, content))

export const ensurePlaintext = async (e: TrustedEvent) => {
  if (e.content && !getPlaintext(e)) {
    const $signer = getSigner(getSession(e.pubkey))

    if ($signer) {
      setPlaintext(e, await decrypt($signer, e.pubkey, e.content))
    }
  }

  return getPlaintext(e)
}
