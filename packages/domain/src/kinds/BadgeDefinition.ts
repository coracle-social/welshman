import {removeUndefined, spec} from "@welshman/lib"
import {BADGE_DEFINITION, matchTag, matchTags, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// An image plus the dimensions it was published at, as `["image", url, "1024x1024"]`.
export type BadgeImage = {
  url: string
  dim?: string
}

const parseImage = ([, url, dim]: string[]): BadgeImage | undefined => {
  if (url) {
    return {url, dim: dim || undefined}
  }
}

const renderImage = (key: string, {url, dim}: BadgeImage) => removeUndefined([key, url, dim])

// NIP-58 kind-30009 badge definition. Its `d` tag is the badge's slug, unique per
// issuer, so a badge is identified by the `30009:issuer:slug` address.
export class BadgeDefinitionReader extends EventReader {
  name() {
    return tagValue(tagSpec("name"), this.event.tags)
  }

  description() {
    return tagValue(tagSpec("description"), this.event.tags)
  }

  image(): BadgeImage | undefined {
    const tag = matchTag(tagSpec("image"), this.event.tags)

    if (tag) {
      return parseImage(tag)
    }
  }

  // A badge may offer several thumbnails, one per size.
  thumbs(): BadgeImage[] {
    return removeUndefined(matchTags(tagSpec("thumb"), this.event.tags).map(parseImage))
  }
}

export class BadgeDefinitionWriter extends EventWriter<BadgeDefinitionReader> {
  setName(name: string) {
    return this.dropTags(spec(["name"])).addTags(["name", name])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setImage(image: BadgeImage) {
    return this.dropTags(spec(["image"])).addTags(renderImage("image", image))
  }

  setThumbs(thumbs: BadgeImage[]) {
    return this.dropTags(spec(["thumb"])).addTags(
      ...thumbs.map(thumb => renderImage("thumb", thumb)),
    )
  }
}

export class BadgeDefinitionQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const BadgeDefinition = new KindFactory({
  kind: BADGE_DEFINITION,
  reader: BadgeDefinitionReader,
  writer: BadgeDefinitionWriter,
  query: BadgeDefinitionQuery,
})
