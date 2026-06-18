import {makeHttpAuth, sendManagementRequest} from "@welshman/util"
import type {ManagementRequest} from "@welshman/util"
import {User} from "../user.js"
import type {IClient} from "../client.js"

/**
 * NIP-86 relay management. Signs an HTTP-auth event as the client's user and
 * sends an admin request to a relay's management endpoint.
 */
export class RelayManagement {
  constructor(readonly ctx: IClient) {}

  post = async (url: string, request: ManagementRequest) => {
    url = url.replace(/^ws/, "http")

    const authTemplate = await makeHttpAuth(url, "POST", JSON.stringify(request))
    const authEvent = await User.require(this.ctx).sign(authTemplate)

    return sendManagementRequest(url, request, authEvent)
  }
}
