import {Base64} from "js-base64"
import {sha256, textEncoder} from "@welshman/lib"
import {makeEvent, SignedEvent} from "./Events.js"
import {HTTP_AUTH} from "./Kinds.js"

export const makeHttpAuth = async (url: string, method = "GET", body?: string) => {
  const tags = [
    ["u", url],
    ["method", method],
  ]

  if (body) {
    tags.push(["payload", await sha256(textEncoder.encode(body))])
  }

  return makeEvent(HTTP_AUTH, {tags})
}

export const makeHttpAuthHeader = (event: SignedEvent) =>
  `Nostr ${Base64.encode(JSON.stringify(event))}`
