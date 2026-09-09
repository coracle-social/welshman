// NIP-54 wiki article names. Versions of an article by different authors line up
// only when they share a normalized `d` tag, so both the tag itself and any
// wikilink target has to be run through this.
//
// Whitespace becomes a hyphen before punctuation is dropped, so the hyphens
// standing in for spaces survive ("What's Up?" -> "whats-up"). Letters and
// numbers of any script are kept, as are combining marks, which would otherwise
// strip the accent off a decomposed "ñ".
export const normalizeWikiName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\p{M}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")

export const isNormalizedWikiName = (name: string) => name === normalizeWikiName(name)
