import {nthEq, nthNe, prop, spec, uniq, uniqBy} from "@welshman/lib"
import {
  WIKI_MERGE_REQUEST,
  addressTags,
  getAddress,
  hexTags,
  inbox,
  outbox,
  tagValue,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

export const SOURCE = "source"

const isSourceTag = (tag: string[]) => tag[0] === "e" && tag[3] === SOURCE

// NIP-54 kind-818 merge request: an offer to fold one version of a wiki article
// into another author's version of it. The target author accepts or rejects it
// with a NIP-25 `+`/`-` reaction. `content` optionally explains the change.
export class WikiMergeRequestReader extends EventReader {
  // The article to merge into. Named for the article because `address` is the
  // merge request's own address.
  articleAddress() {
    return tagValue(addressTags("a"), this.event.tags)
  }

  // The pubkey the request is directed at — the author of the target article.
  articleAuthor() {
    return tagValue(hexTags("p"), this.event.tags)
  }

  // The version the modification was made against, when the author named one.
  baseId() {
    return tagValue(hexTags("e"), this.event.tags.filter(nthNe(3, SOURCE)))
  }

  // The wiki article to be merged.
  sourceId() {
    return tagValue(hexTags("e"), this.event.tags.filter(nthEq(3, SOURCE)))
  }
}

export class WikiMergeRequestWriter extends EventWriter<WikiMergeRequestReader> {
  // The version being modified: it names the article to merge into, its author,
  // and the exact version the change was made against.
  setArticle(event: TrustedEvent) {
    this.dropTags(t => t[0] === "p" || t[0] === "a" || (t[0] === "e" && t[3] !== SOURCE))

    const tags = [
      ["a", getAddress(event), ""],
      ["e", event.id, ""],
    ]

    this.addTags(...tags)

    this.hint(outbox(event.pubkey)).then(url => {
      for (const tag of tags) {
        tag[2] = url
      }
    })

    return this.addMention(event.pubkey)
  }

  // The proposed version, which per NIP-54 must itself be a wiki article.
  setSource(event: TrustedEvent) {
    this.dropTags(isSourceTag)

    const tag = ["e", event.id, "", SOURCE]

    this.addTags(tag)

    this.hint(outbox(event.pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["a"]))) {
      throw new Error("A merge request must reference the article it targets via an a tag")
    }

    if (!this.extraTags.some(isSourceTag)) {
      throw new Error("A merge request must reference the version to be merged via a source e tag")
    }
  }
}

export class WikiMergeRequestQuery extends EventQuery {
  articles: TrustedEvent[] = []

  // Merge requests targeting a given version's article.
  forArticle(event: TrustedEvent) {
    this.articles = uniqBy(prop("id"), [...this.articles, event])

    return this
  }

  protected renderDomainFilters() {
    return this.articles.length > 0 ? [{"#a": uniq(this.articles.map(getAddress))}] : [{}]
  }

  // A merge request is delivered to the target article's author, so it's their
  // inbox that has it rather than the requester's outbox alone.
  protected renderRoutes() {
    return [
      ...this.authorRoutes(),
      ...this.mentionRoutes(),
      ...this.articles.map(event => inbox(event.pubkey, 0.5)),
    ]
  }
}

export const WikiMergeRequest = new KindFactory({
  kind: WIKI_MERGE_REQUEST,
  reader: WikiMergeRequestReader,
  writer: WikiMergeRequestWriter,
  query: WikiMergeRequestQuery,
})
