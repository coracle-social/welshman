import {nthEq, spec} from "@welshman/lib"
import {
  WIKI,
  addressTags,
  getAddress,
  hexTags,
  isNormalizedWikiName,
  matchTag,
  normalizeWikiName,
  outbox,
  tagSpec,
  tagValue,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// Another version of an article, pointed at by a marked tag pair. NIP-54 asks for
// both an `a` and an `e` tag — the address finds the current version, the id the
// exact one — but a reader takes whichever half is there.
export type WikiVersion = {
  address?: string
  id?: string
  relay: string
}

export const FORK = "fork"

export const DEFER = "defer"

const getVersion = (marker: string, tags: string[][]): WikiVersion | undefined => {
  const marked = tags.filter(nthEq(3, marker))
  const aTag = matchTag(addressTags("a"), marked)
  const eTag = matchTag(hexTags("e"), marked)

  if (!aTag && !eTag) return undefined

  return {address: aTag?.[1], id: eTag?.[1], relay: aTag?.[2] || eTag?.[2] || ""}
}

const isVersionTag = (marker: string) => (tag: string[]) =>
  ["a", "e"].includes(tag[0]) && tag[3] === marker

// NIP-54 kind-30818 wiki article. The `d` tag is the subject in normalized form,
// which is how articles by different authors about the same thing find each
// other, and `content` is Djot.
export class WikiReader extends EventReader {
  // The subject as the author wrote it, when it differs from the normalized
  // identifier ("Bitcoin" vs "bitcoin").
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  summary() {
    return tagValue(tagSpec("summary"), this.event.tags)
  }

  // The version this article was forked from.
  fork() {
    return getVersion(FORK, this.event.tags)
  }

  // The version this article defers to as the better one. A stronger signal than
  // a reaction — the author is pointing readers away from their own version.
  deferral() {
    return getVersion(DEFER, this.event.tags)
  }
}

export class WikiWriter extends EventWriter<WikiReader> {
  // The article's subject. The identifier is the normalized form, since that's
  // what makes versions of a subject addressable together; the title keeps what
  // the author actually typed.
  setName(name: string) {
    return this.setIdentifier(normalizeWikiName(name)).setTitle(name)
  }

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setSummary(summary: string) {
    return this.dropTags(spec(["summary"])).addTags(["summary", summary])
  }

  // `event` is the wiki article this one branched off of.
  setFork(event: TrustedEvent) {
    return this.setVersion(FORK, event)
  }

  clearFork() {
    return this.dropTags(isVersionTag(FORK))
  }

  // `event` is the wiki article this one yields to.
  setDeferral(event: TrustedEvent) {
    return this.setVersion(DEFER, event)
  }

  clearDeferral() {
    return this.dropTags(isVersionTag(DEFER))
  }

  // An article forks from, or defers to, one version at a time, so each marker
  // replaces its own tag pair and leaves the other marker's alone.
  private setVersion(marker: string, event: TrustedEvent) {
    this.dropTags(isVersionTag(marker))

    const tags = [
      ["e", event.id, "", marker],
      ["a", getAddress(event), "", marker],
    ]

    this.addTags(...tags)

    this.hint(outbox(event.pubkey)).then(url => {
      for (const tag of tags) {
        tag[2] = url
      }
    })

    return this
  }

  validate() {
    super.validate()

    const name = this.identifierTag?.[1] ?? ""

    if (!isNormalizedWikiName(name)) {
      throw new Error(
        `A wiki article's d tag must be normalized (got "${name}", expected "${normalizeWikiName(name)}")`,
      )
    }
  }
}

export class WikiQuery extends EventQuery {
  // Articles about a subject, whoever wrote them. Names are normalized on the way
  // in, so a display title or a wikilink target can be passed as-is.
  forName(...names: string[]) {
    return this.addTag("d", names.map(normalizeWikiName))
  }

  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Wiki = new KindFactory({
  kind: WIKI,
  reader: WikiReader,
  writer: WikiWriter,
  query: WikiQuery,
})
