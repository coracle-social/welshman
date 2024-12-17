import {writable} from "svelte/store"
import {assoc} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {withGetter} from "@welshman/store"
import {decrypt} from "@welshman/signer"
import {getSigner, getSession} from "./session.js"

export const plaintext = withGetter(writable<Record<string, string>>({}))

export const getPlaintext = (e: TrustedEvent) => plaintext.get()[e.id]

export const setPlaintext = (e: TrustedEvent, content: string) =>
  plaintext.update(assoc(e.id, content))

export const ensurePlaintext = async (e: TrustedEvent) => {
  if (e.content && !getPlaintext(e)) {
    const $session = getSession(e.pubkey)

    if (!$session) return

    const $signer = getSigner($session)

    if (!$signer) return

    let result

    try {
      result = await decrypt($signer, e.pubkey, e.content)
    } catch (e: any) {
      if (!String(e).match(/invalid base64/)) {
        throw e
      }
    }

    if (result) {
      setPlaintext(e, result)
    }
  }

  return getPlaintext(e)
}
