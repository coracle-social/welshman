import {first} from "@welshman/lib"
import {RELAY_INVITE, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-28935 relay invite.
export class RelayInvite extends EventReader {
  readonly kind = RELAY_INVITE

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  builder() {
    return new RelayInviteBuilder(this)
  }
}

export class RelayInviteBuilder extends EventBuilder<RelayInvite> {
  readonly kind = RELAY_INVITE

  claimTag?: string[]

  constructor(readonly reader?: RelayInvite) {
    super(reader)

    this.claimTag = first(this.consumeTags("claim"))
  }

  setClaim(claim: string) {
    this.claimTag = ["claim", claim]

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.claimTag) tags.push(this.claimTag)

    return tags
  }
}
