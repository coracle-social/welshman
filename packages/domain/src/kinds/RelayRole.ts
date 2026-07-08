import {first, spec} from "@welshman/lib"
import {RELAY_ROLE, getTags, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// An hsl color tuple. Components are raw strings; any may be empty, in which
// case the client supplies its own default. Usually only `hue` is set.
export type RelayRoleColor = {
  hue: string // 0 to 360
  saturation: string // 0 to 1
  lightness: string // 0 to 1
}

// Flotilla kind-33534 relay role definition, published by the relay's self
// key. The `d` tag is the role id; kind-13534 member lists reference roles via
// extra values on `member` tags (["member", pubkey, ...roleIds]).
export class RelayRoleReader extends EventReader {
  readonly kind = RELAY_ROLE

  label() {
    return getTagValue("label", this.event.tags)
  }

  description() {
    return getTagValue("description", this.event.tags)
  }

  color(): RelayRoleColor {
    const tag = first(getTags("color", this.event.tags)) ?? []

    return {hue: tag[1] ?? "", saturation: tag[2] ?? "", lightness: tag[3] ?? ""}
  }

  order() {
    const order = parseInt(getTagValue("order", this.event.tags) ?? "")

    return isNaN(order) ? 0 : order
  }
}

export class RelayRoleBuilder extends EventBuilder<RelayRoleReader> {
  readonly kind = RELAY_ROLE

  setLabel(label: string) {
    return this.dropTags(spec(["label"])).addTags(["label", label])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setColor({hue, saturation, lightness}: RelayRoleColor) {
    return this.dropTags(spec(["color"])).addTags(["color", hue, saturation, lightness])
  }

  setOrder(order: number) {
    return this.dropTags(spec(["order"])).addTags(["order", String(order)])
  }
}

export const RelayRole = new Kind({
  reader: RelayRoleReader,
  builder: RelayRoleBuilder,
  router: OutboxRouter,
})
