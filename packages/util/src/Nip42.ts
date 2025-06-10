import {makeEvent} from "./Events.js"
import {CLIENT_AUTH} from "./Kinds.js"

export const makeRelayAuth = (url: string, challenge: string) =>
  makeEvent(CLIENT_AUTH, {
    tags: [
      ["relay", url],
      ["challenge", challenge],
    ],
  })
