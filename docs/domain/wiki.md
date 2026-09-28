# Wiki

NIP-54 wiki kinds: articles, redirects, and merge requests. Each is a plain `EventReader` / `EventWriter` pair; see [Readers & Writers](./readers-and-writers) for the base pattern. Every example below assumes a bound `KindContext`.

An article's `d` tag is its subject in normalized form, which is how versions of an article by different authors find each other. `normalizeWikiName` from `@welshman/util` lowercases the name, turns whitespace into hyphens, and drops punctuation (`"What's Up?"` becomes `"whats-up"`). The `Wiki` and `WikiRedirect` writers throw from `validate()` when the `d` tag is not normalized, and their queries normalize the names they are given.

All three writers use the default routing (the author's outbox plus every p-tagged pubkey's inbox), and all three queries route to the queried authors' outboxes and the inboxes of the pubkeys a `#p` filter names.

## Wiki (kind 30818)

A wiki article. The content is Djot.

```typescript
import {Wiki} from "@welshman/domain"
import type {WikiVersion} from "@welshman/domain"

const article = Wiki.configure(context).reader(event).parse()
article.identifier()   // the normalized subject ("bitcoin")
article.title()        // the subject as written ("Bitcoin")
article.summary()      // "summary" tag value
article.fork()         // WikiVersion this article was forked from, or undefined
article.deferral()     // WikiVersion this article defers to, or undefined

await Wiki.configure(context)
  .writer()
  .setName("Bitcoin")          // d = "bitcoin", title = "Bitcoin"
  .setSummary("A peer-to-peer electronic cash system")
  .setFork(otherArticle)       // or setDeferral(otherArticle)
  .setContent(djot)
  .renderTemplate()
```

`setName(name)` sets the `d` tag to the normalized name and the `title` tag to the name as given. `setTitle` and `setSummary` set their tags alone.

A fork or a deferral points at another version of the article through an `e` and an `a` tag marked `fork` or `defer`, hinted with that author's outbox. A `WikiVersion` is `{address?, id?, relay}`, and a reader returns whichever half of the pair is present. `setFork(event)` and `setDeferral(event)` each replace their own marked pair and leave the other alone, and `clearFork()` and `clearDeferral()` remove them.

To fetch every version of a subject, whoever wrote it:

```typescript
const {filters, relays} = await Wiki.configure(context).query().forName("Bitcoin").render()
```

## WikiRedirect (kind 30819)

A redirect from one subject to another article ("btc" to an article on "bitcoin"). A client can follow it, or collect several redirects into a disambiguation page.

```typescript
import {WikiRedirect} from "@welshman/domain"

const redirect = WikiRedirect.configure(context).reader(event).parse()
redirect.identifier()       // the subject redirected away from
redirect.articleAddress()   // a-tag value — the article redirected to

await WikiRedirect.configure(context)
  .writer()
  .setName("BTC")             // d = "btc"
  .setArticle(bitcoinArticle)
  .renderTemplate()
```

`setName(name)` sets the normalized `d` tag, and `setArticle(event)` replaces the `a` tag, hinted with the article author's outbox. `validate()` requires the `a` tag. `WikiRedirectQuery.forName(...names)` asks for the redirects away from a subject, and `forArticle(...events)` for the redirects pointing at those events' addresses.

## WikiMergeRequest (kind 818)

A request to merge one version of an article into another author's version. The content optionally explains the change.

```typescript
import {WikiMergeRequest} from "@welshman/domain"

const request = WikiMergeRequest.configure(context).reader(event).parse()
request.articleAddress()   // a-tag value — the article to merge into
request.articleAuthor()    // p-tag value — that article's author
request.baseId()           // unmarked e-tag value — the version the change was made against
request.sourceId()         // e-tag value marked "source" — the version to merge

await WikiMergeRequest.configure(context)
  .writer()
  .setArticle(theirArticle)
  .setSource(myArticle)
  .setContent("Fixes the block reward figures")
  .renderTemplate()
```

`setArticle(event)` replaces the `a`, `p` and unmarked `e` tags with the target article's address, author, and id. `setSource(event)` replaces the `e` tag marked `source`. Both hint with the event author's outbox. `validate()` requires the `a` tag and the `source` tag. The `p` tag routes the request to the target author's inbox under the default routing.

`WikiMergeRequestQuery.forArticle(event)` filters on the article's address and adds the article author's inbox to the routes:

```typescript
const {filters, relays} = await WikiMergeRequest.configure(context)
  .query()
  .forArticle(myArticle)
  .render()
```

## See also

- [Content](./content) — `Article` (kind 30023), the NIP-23 long-form kind.
- [Readers & Writers](./readers-and-writers) — the base pattern and `d`-tag validation.
