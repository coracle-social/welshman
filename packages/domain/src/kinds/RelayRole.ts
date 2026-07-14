import {spec} from "@welshman/lib"
import {RELAY_ROLE, getTagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Flotilla kind-33534 relay role definition, published by the relay's self
// key. The `d` tag is the role id; kind-13534 member lists reference roles via
// extra values on `member` tags (["member", pubkey, ...roleIds]).
export class RelayRoleReader extends EventReader {
  label() {
    return getTagValue("label", this.event.tags)
  }

  description() {
    return getTagValue("description", this.event.tags)
  }

  // A hue, 0 to 360. Undefined when unset or invalid, so the client can default.
  color() {
    const hue = parseInt(getTagValue("color", this.event.tags) ?? "")

    return isNaN(hue) ? undefined : hue
  }

  order() {
    const order = parseInt(getTagValue("order", this.event.tags) ?? "")

    return isNaN(order) ? 0 : order
  }
}

export class RelayRoleWriter extends EventWriter<RelayRoleReader> {
  readonly requiresRelays = true

  setLabel(label: string) {
    return this.dropTags(spec(["label"])).addTags(["label", label])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setColor(hue: number) {
    return this.dropTags(spec(["color"])).addTags(["color", String(hue)])
  }

  setOrder(order: number) {
    return this.dropTags(spec(["order"])).addTags(["order", String(order)])
  }
}

export const RelayRole = new KindFactory({
  kind: RELAY_ROLE,
  reader: RelayRoleReader,
  writer: RelayRoleWriter,
})
