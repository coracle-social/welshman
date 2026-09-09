import {isHex32, removeUndefined, somePass, spec} from "@welshman/lib"
import {Address, BADGES} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// NIP-58 fixes the identifier of a profile badges event, so there is only ever one
// per pubkey.
export const PROFILE_BADGES_IDENTIFIER = "profile_badges"

export type ProfileBadge = {
  address: string
  awardId: string
  relay?: string
}

// A displayed badge is an `a` tag naming the definition immediately followed by an
// `e` tag naming the award, so badges are read positionally rather than by key.
const parseBadges = (tags: string[][]): ProfileBadge[] => {
  const badges: ProfileBadge[] = []

  for (let i = 0; i < tags.length - 1; i++) {
    const [key, address] = tags[i]
    const [nextKey, awardId, relay] = tags[i + 1]

    if (key === "a" && nextKey === "e" && Address.isAddress(address) && isHex32(awardId)) {
      badges.push({address, awardId, relay: relay || undefined})
    }
  }

  return badges
}

const renderBadge = ({address, awardId, relay}: ProfileBadge) => [
  ["a", address],
  removeUndefined(["e", awardId, relay]),
]

// NIP-58 kind-30008 profile badges — the badges a pubkey has accepted, in the
// order they should be displayed.
export class ProfileBadgesReader extends EventReader {
  badges(): ProfileBadge[] {
    return parseBadges(this.event.tags)
  }

  includes(address: string) {
    return this.badges().some(badge => badge.address === address)
  }
}

export class ProfileBadgesWriter extends EventWriter<ProfileBadgesReader> {
  constructor(kind: number, context: KindContext, reader?: ProfileBadgesReader) {
    super(kind, context, reader)

    this.identifierTag = ["d", PROFILE_BADGES_IDENTIFIER]
  }

  setBadges(badges: ProfileBadge[]) {
    return this.dropTags(somePass(spec(["a"]), spec(["e"]))).addTags(...badges.flatMap(renderBadge))
  }

  // Accepting a badge already displayed moves it to the end rather than listing it twice.
  addBadge(badge: ProfileBadge) {
    return this.setBadges([...this.withoutBadge(badge.address), badge])
  }

  removeBadge(address: string) {
    return this.setBadges(this.withoutBadge(address))
  }

  private withoutBadge(address: string) {
    return parseBadges(this.extraTags).filter(badge => badge.address !== address)
  }
}

export class ProfileBadgesQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const ProfileBadges = new KindFactory({
  kind: BADGES,
  reader: ProfileBadgesReader,
  writer: ProfileBadgesWriter,
  query: ProfileBadgesQuery,
})
