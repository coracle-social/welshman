import {spec} from "@welshman/lib"
import {
  WIKI_REDIRECT,
  addressTags,
  getAddress,
  isNormalizedWikiName,
  normalizeWikiName,
  outbox,
  tagValue,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-54 kind-30819 wiki redirect: the `d` tag is a subject that should show some
// other article instead ("btc" -> an article on "bitcoin"), so a client can either
// follow it or collect several into a disambiguation page.
export class WikiRedirectReader extends EventReader {
  // The article to redirect to. Named for the article because `address` is the
  // redirect's own address.
  articleAddress() {
    return tagValue(addressTags("a"), this.event.tags)
  }
}

export class WikiRedirectWriter extends EventWriter<WikiRedirectReader> {
  // The subject being redirected away from, normalized like any wiki name so it
  // collides with the articles it stands in for.
  setName(name: string) {
    return this.setIdentifier(normalizeWikiName(name))
  }

  // `event` is the wiki article to redirect to.
  setArticle(event: TrustedEvent) {
    this.dropTags(spec(["a"]))

    const tag = ["a", getAddress(event), ""]

    this.addTags(tag)

    this.hint(outbox(event.pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  validate() {
    super.validate()

    const name = this.identifierTag?.[1] ?? ""

    if (!isNormalizedWikiName(name)) {
      throw new Error(
        `A wiki redirect's d tag must be normalized (got "${name}", expected "${normalizeWikiName(name)}")`,
      )
    }

    if (!this.extraTags.some(spec(["a"]))) {
      throw new Error("A wiki redirect must point at an article via an a tag")
    }
  }
}

export class WikiRedirectQuery extends EventQuery {
  // Redirects away from a subject — what a client follows when a name has no
  // article. Names are normalized on the way in.
  forName(...names: string[]) {
    return this.addTag("d", names.map(normalizeWikiName))
  }

  // Redirects pointing at a given version's article, which is what a
  // disambiguation page is built from.
  forArticle(...events: TrustedEvent[]) {
    return this.addTag("a", events.map(getAddress))
  }

  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const WikiRedirect = new KindFactory({
  kind: WIKI_REDIRECT,
  reader: WikiRedirectReader,
  writer: WikiRedirectWriter,
  query: WikiRedirectQuery,
})
