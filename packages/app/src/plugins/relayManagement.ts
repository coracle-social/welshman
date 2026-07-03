import {ManagementApi} from "@welshman/util"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * NIP-86 relay management, authenticated as the app's user. `forUrl` returns a
 * `ManagementApi` client for a relay (`app.use(RelayManagement).forUrl(url).deleteRole(id)`).
 */
export class RelayManagement {
  constructor(readonly app: IApp) {}

  // A management client for `url`, signing auth events as the app's user.
  forUrl = (url: string) => new ManagementApi(url, User.require(this.app).sign)
}
