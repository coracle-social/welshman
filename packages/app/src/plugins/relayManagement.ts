import {stamp, makeHttpAuth, sendManagementRequest} from "@welshman/util"
import type {EventTemplate, ManagementRequest} from "@welshman/util"
import {User} from "../user.js"
import {Thunks} from "./thunk.js"
import type {IApp} from "../app.js"

/**
 * NIP-86 relay management. Signs an HTTP-auth event as the app's user and
 * sends an admin request to a relay's management endpoint.
 */
export class RelayManagement {
  constructor(readonly app: IApp) {}

  post = async (url: string, request: ManagementRequest) => {
    url = url.replace(/^ws/, "http")

    const authTemplate = await makeHttpAuth(url, "POST", JSON.stringify(request))
    const authEvent = await User.require(this.app).sign(authTemplate)

    return sendManagementRequest(url, request, authEvent)
  }

  // Sign `event` as the app's user and publish it directly to `url`, bypassing
  // outbox routing — for delivering a command straight to a specific relay.
  publishToRelay = async (url: string, event: EventTemplate) => {
    const signedEvent = await User.require(this.app).sign(stamp(event))

    return this.app.use(Thunks).publish({event: signedEvent, relays: [url]})
  }
}
