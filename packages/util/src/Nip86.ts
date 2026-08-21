import {SignedEvent, StampedEvent, EventTemplate} from "./Events.js"
import {makeHttpAuth, makeHttpAuthHeader} from "./Nip98.js"

// Signs a NIP-98 auth event (typically the app user's signer). Given the
// unsigned auth template, it returns the signed event.
export type ManagementSign = (event: StampedEvent) => Promise<SignedEvent>

export type ManagementRequest = {
  method: string
  params: any[]
}

export type ManagementResponse = {
  result?: any
  error?: string
}

// Append an optional reason to a single-value param list, per the NIP-86
// `["<value>", "<optional-reason>"]` shape.
const withReason = (value: string, reason?: string) =>
  reason === undefined ? [value] : [value, reason]

// ── Request builders, one per NIP-86 method ──

export const makeSupportedMethods = (): ManagementRequest => ({
  method: "supportedmethods",
  params: [],
})

export const makeBanPubkey = (pubkey: string, reason?: string): ManagementRequest => ({
  method: "banpubkey",
  params: withReason(pubkey, reason),
})

export const makeUnbanPubkey = (pubkey: string, reason?: string): ManagementRequest => ({
  method: "unbanpubkey",
  params: withReason(pubkey, reason),
})

export const makeListBannedPubkeys = (): ManagementRequest => ({
  method: "listbannedpubkeys",
  params: [],
})

export const makeAllowPubkey = (pubkey: string, reason?: string): ManagementRequest => ({
  method: "allowpubkey",
  params: withReason(pubkey, reason),
})

export const makeUnallowPubkey = (pubkey: string, reason?: string): ManagementRequest => ({
  method: "unallowpubkey",
  params: withReason(pubkey, reason),
})

export const makeListAllowedPubkeys = (): ManagementRequest => ({
  method: "listallowedpubkeys",
  params: [],
})

export const makeCreateRole = (
  id: string,
  label: string,
  description: string,
  color: number,
  order: number,
): ManagementRequest => ({
  method: "createrole",
  params: [id, label, description, color, order],
})

export const makeEditRole = (
  id: string,
  label: string,
  description: string,
  color: number,
  order: number,
): ManagementRequest => ({
  method: "editrole",
  params: [id, label, description, color, order],
})

export const makeDeleteRole = (id: string): ManagementRequest => ({
  method: "deleterole",
  params: [id],
})

export const makeAssignRole = (pubkey: string, roleId: string): ManagementRequest => ({
  method: "assignrole",
  params: [pubkey, roleId],
})

export const makeUnassignRole = (pubkey: string, roleId: string): ManagementRequest => ({
  method: "unassignrole",
  params: [pubkey, roleId],
})

export const makeAssignMethod = (pubkey: string, method: string): ManagementRequest => ({
  method: "assignmethod",
  params: [pubkey, method],
})

export const makeUnassignMethod = (pubkey: string, method: string): ManagementRequest => ({
  method: "unassignmethod",
  params: [pubkey, method],
})

export const makeListClaims = (): ManagementRequest => ({
  method: "listclaims",
  params: [],
})

export const makeCreateClaim = (claim: string): ManagementRequest => ({
  method: "createclaim",
  params: [claim],
})

export const makeDeleteClaim = (claim: string): ManagementRequest => ({
  method: "deleteclaim",
  params: [claim],
})

export const makeListEventsNeedingModeration = (): ManagementRequest => ({
  method: "listeventsneedingmoderation",
  params: [],
})

export const makeAllowEvent = (id: string, reason?: string): ManagementRequest => ({
  method: "allowevent",
  params: withReason(id, reason),
})

export const makeBanEvent = (id: string, reason?: string): ManagementRequest => ({
  method: "banevent",
  params: withReason(id, reason),
})

export const makeListBannedEvents = (): ManagementRequest => ({
  method: "listbannedevents",
  params: [],
})

export const makeChangeRelayName = (name: string): ManagementRequest => ({
  method: "changerelayname",
  params: [name],
})

export const makeChangeRelayDescription = (description: string): ManagementRequest => ({
  method: "changerelaydescription",
  params: [description],
})

export const makeChangeRelayIcon = (iconUrl: string): ManagementRequest => ({
  method: "changerelayicon",
  params: [iconUrl],
})

export const makeAllowKind = (kind: number): ManagementRequest => ({
  method: "allowkind",
  params: [kind],
})

export const makeDisallowKind = (kind: number): ManagementRequest => ({
  method: "disallowkind",
  params: [kind],
})

export const makeListAllowedKinds = (): ManagementRequest => ({
  method: "listallowedkinds",
  params: [],
})

export const makeBlockIp = (ip: string, reason?: string): ManagementRequest => ({
  method: "blockip",
  params: withReason(ip, reason),
})

export const makeUnblockIp = (ip: string): ManagementRequest => ({
  method: "unblockip",
  params: [ip],
})

export const makeListBlockedIps = (): ManagementRequest => ({
  method: "listblockedips",
  params: [],
})

export const makeSignEvent = (event: EventTemplate): ManagementRequest => ({
  method: "signevent",
  params: [event],
})

export const sendManagementRequest = async (
  url: string,
  request: ManagementRequest,
  authEvent: SignedEvent,
): Promise<ManagementResponse> => {
  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/nostr+json+rpc",
        Authorization: makeHttpAuthHeader(authEvent),
      },
    })

    return await res.json()
  } catch (e) {
    const msg = "Failed to send management request"
    console.log(msg, ":", e)
    return {error: "failed to send management request"}
  }
}

/**
 * A NIP-86 relay management client bound to one relay and one signer. Each
 * method builds the request, signs a fresh NIP-98 auth event, and POSTs it —
 * e.g. `new ManagementApi(url, sign).deleteRole(roleId)`. Management shares the
 * relay's websocket URI but is served over HTTP, so `ws(s)://` is normalized to
 * `http(s)://`.
 */
export class ManagementApi {
  readonly url: string

  constructor(
    url: string,
    readonly sign: ManagementSign,
  ) {
    this.url = url.replace(/^ws/, "http")
  }

  send = async (request: ManagementRequest): Promise<ManagementResponse> => {
    const authEvent = await this.sign(await makeHttpAuth(this.url, "POST", JSON.stringify(request)))

    return sendManagementRequest(this.url, request, authEvent)
  }

  supportedMethods = () => this.send(makeSupportedMethods())

  banPubkey = (pubkey: string, reason?: string) => this.send(makeBanPubkey(pubkey, reason))

  unbanPubkey = (pubkey: string, reason?: string) => this.send(makeUnbanPubkey(pubkey, reason))

  listBannedPubkeys = () => this.send(makeListBannedPubkeys())

  allowPubkey = (pubkey: string, reason?: string) => this.send(makeAllowPubkey(pubkey, reason))

  unallowPubkey = (pubkey: string, reason?: string) => this.send(makeUnallowPubkey(pubkey, reason))

  listAllowedPubkeys = () => this.send(makeListAllowedPubkeys())

  createRole = (id: string, label: string, description: string, color: number, order: number) =>
    this.send(makeCreateRole(id, label, description, color, order))

  editRole = (id: string, label: string, description: string, color: number, order: number) =>
    this.send(makeEditRole(id, label, description, color, order))

  deleteRole = (id: string) => this.send(makeDeleteRole(id))

  assignRole = (pubkey: string, roleId: string) => this.send(makeAssignRole(pubkey, roleId))

  unassignRole = (pubkey: string, roleId: string) => this.send(makeUnassignRole(pubkey, roleId))

  assignMethod = (pubkey: string, method: string) => this.send(makeAssignMethod(pubkey, method))

  unassignMethod = (pubkey: string, method: string) => this.send(makeUnassignMethod(pubkey, method))

  listClaims = () => this.send(makeListClaims())

  createClaim = (claim: string) => this.send(makeCreateClaim(claim))

  deleteClaim = (claim: string) => this.send(makeDeleteClaim(claim))

  listEventsNeedingModeration = () => this.send(makeListEventsNeedingModeration())

  allowEvent = (id: string, reason?: string) => this.send(makeAllowEvent(id, reason))

  banEvent = (id: string, reason?: string) => this.send(makeBanEvent(id, reason))

  listBannedEvents = () => this.send(makeListBannedEvents())

  changeRelayName = (name: string) => this.send(makeChangeRelayName(name))

  changeRelayDescription = (description: string) =>
    this.send(makeChangeRelayDescription(description))

  changeRelayIcon = (iconUrl: string) => this.send(makeChangeRelayIcon(iconUrl))

  allowKind = (kind: number) => this.send(makeAllowKind(kind))

  disallowKind = (kind: number) => this.send(makeDisallowKind(kind))

  listAllowedKinds = () => this.send(makeListAllowedKinds())

  blockIp = (ip: string, reason?: string) => this.send(makeBlockIp(ip, reason))

  unblockIp = (ip: string) => this.send(makeUnblockIp(ip))

  listBlockedIps = () => this.send(makeListBlockedIps())

  signEvent = (event: EventTemplate) => this.send(makeSignEvent(event))
}
