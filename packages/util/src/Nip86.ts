import {SignedEvent} from "./Events.js"
import {makeHttpAuthHeader} from "./Nip98.js"

export enum ManagementMethod {
  SupportedMethods = "supportedmethods",
  BanPubkey = "banpubkey",
  AllowPubkey = "allowpubkey",
  ListBannedPubkeys = "listbannedpubkeys",
  ListAllowedPubkeys = "listallowedpubkeys",
  ListEventsNeedingModeration = "listeventsneedingmoderation",
  AllowEvent = "allowevent",
  BanEvent = "banevent",
  ListBannedEvents = "listbannedevents",
  ChangeRelayName = "changerelayname",
  ChangeRelayDescription = "changerelaydescription",
  ChangeRelayIcon = "changerelayicon",
  AllowKind = "allowkind",
  DisallowKind = "disallowkind",
  ListAllowedKinds = "listallowedkinds",
  BlockIp = "blockip",
  UnblockIp = "unblockip",
  ListBlockedIps = "listblockedips",
}

export type ManagementRequest = {
  method: ManagementMethod
  params: string[]
}

export type ManagementResponse = {
  result?: any
  error?: string
}

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
