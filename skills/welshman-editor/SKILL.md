---
name: welshman-editor
description: Use this skill when working with @welshman/editor: the batteries-included Tiptap-based rich-text editor for composing nostr notes with mention autocomplete, media upload, and inline nostr objects.
---

# welshman/editor — Nostr Editor Component

`@welshman/editor` provides a batteries-included text editor for composing nostr notes, built on top of [Tiptap](https://tiptap.dev) and [nostr-editor](https://github.com/cesardeazevedo/nostr-editor). It bundles a curated set of extensions that handle nostr-specific concerns (nprofile mentions, nevent/naddr embeds, file upload, Lightning invoices) as well as general composition features (history, placeholder, inline code, word count). It is framework-agnostic — the core is plain TypeScript/DOM, though it powers the Svelte-based editors of Coracle and Flotilla.

## Installation

```bash
npm install @welshman/editor
# or
pnpm add @welshman/editor
# or
yarn add @welshman/editor
```

Peer dependencies that must be installed separately:

```bash
npm install @welshman/lib @welshman/util nostr-tools nostr-editor
```

Import the bundled CSS to get default object/suggestion styles (optional but recommended):

```ts
import "@welshman/editor/index.css"
```

---

## Key Exports

### Extensions

| Export | Description |
|--------|-------------|
| `WelshmanExtension` | The main all-in-one Tiptap extension. Configure once; it registers every sub-extension below. `submit` is **required**. |
| `BreakOrSubmit` | Keyboard handler: `Mod-Enter` always submits; `Enter` submits only when `aggressive: true` (chat-style); `Shift-Enter` inserts a hard break. |
| `CodeInline` | Inline `code` node with backtick input/paste rules. |
| `WordCount` | Extension that tracks `editor.storage.wordCount.words` and `editor.storage.wordCount.chars` on every document update. |

### Node Views

These are drop-in Tiptap node-view factory functions that render inline pill elements with `.tiptap-object` CSS class. Override them via `WelshmanExtensionOptions` to render richer UI.

| Export | Renders |
|--------|---------|
| `MentionNodeView` | nprofile nodes — shows `@<bech32 prefix>…` |
| `MediaNodeView` | Image and video nodes — shows filename or URL; adds `.tiptap-uploading` animation while uploading |
| `EventNodeView` | nevent and naddr nodes — shows bech32 prefix |
| `Bolt11NodeView` | bolt11 Lightning invoice nodes — shows the first 16 characters of the Lightning invoice string (the `lnbc` attribute) followed by `...` |

### Plugins

| Export | Description |
|--------|-------------|
| `TippySuggestion` | Generic Tippy.js-powered `@tiptap/suggestion` wrapper. Requires `char` (trigger character), `name` (ProseMirror node type name), `editor`, `search` (returns string items), and `select` (handles item selection). |
| `MentionSuggestion` | Pre-configured `TippySuggestion` for `@`-triggered nprofile autocomplete. Requires `editor`, `search`, and `getRelays`; accepts optional UI customization. |
| `DefaultSuggestionsWrapper` | Default dropdown renderer used by `TippySuggestion`. Implements `ISuggestionsWrapper`; replace to use a framework component. |

### Re-exports from upstream

| Export | Source |
|--------|--------|
| `Editor` | `@tiptap/core` — the editor instance class |
| `NodeViewProps` | `@tiptap/core` — prop type for node view factories |
| `UploadTask` | `nostr-editor` — shape of an in-progress or completed file upload |
| `FileAttributes` | `nostr-editor` — `{ file: File, … }` passed to the `upload` callback |
| `editorProps` | `nostr-editor` — base ProseMirror `editorProps` used by nostr-editor |

---

## WelshmanExtensionOptions Reference

All keys are optional. Pass `false` to disable a built-in extension entirely. Pass `{ extend?, config? }` to override defaults.

```ts
type WelshmanExtensionOptions = {
  bolt11?:        false
  breakOrSubmit?: false | { extend?, config?: BreakOrSubmitOptions }
  codeInline?:    false | { extend?, config? }
  codeBlock?:     false | { extend?, config?: CodeBlockOptions }
  document?:      false
  dropcursor?:    false | { extend?, config?: DropcursorOptions }
  fileUpload?:    { extend?: Partial<any>, config?: Partial<FileUploadOptions> & Pick<FileUploadOptions, "upload"> }
  gapcursor?:     false
  history?:       false | { extend?, config?: HistoryOptions }
  image?:         false | { extend?, config?: ImageOptions }
  link?:          false | { extend?, config?: LinkOptions }
  naddr?:         false | { extend?, config? }
  nevent?:        false | { extend?, config? }
  nprofile?:      false | { extend?, config? }
  nsecReject?:    false | { extend?, config?: NSecRejectOptions }
  paragraph?:     false | { extend?, config?: ParagraphOptions }
  placeholder?:   false | { extend?, config?: PlaceholderOptions }
  tag?:           false
  text?:          false
  video?:         false
  wordCount?:     false
}
```

`fileUpload.config` requires at minimum an `upload` function. Default allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/mpeg`, `video/webm`. `immediateUpload` defaults to `true`.

---

## Common Patterns

### 1. Minimal editor with submit on Mod-Enter

```ts
import {Editor} from "@welshman/editor"
import {WelshmanExtension} from "@welshman/editor"

const editor = new Editor({
  element: document.getElementById("editor")!,
  extensions: [
    WelshmanExtension.configure({
      submit: () => {
        const content = editor.getText({blockSeparator: "\n"}).trim()
        const tags = editor.storage.nostr.getEditorTags()
        console.log({content, tags})
        editor.chain().clearContent().run()
      },
    }),
  ],
})
```

### 2. Chat-style editor (Enter submits)

```ts
WelshmanExtension.configure({
  submit,
  extensions: {
    breakOrSubmit: {
      config: {aggressive: true}, // Enter submits; Shift-Enter inserts line break
    },
    placeholder: {
      config: {placeholder: "Send a message…"},
    },
  },
})
```

### 3. File upload with Blossom/NIP-96 server

```ts
import type {FileAttributes} from "@welshman/editor"

WelshmanExtension.configure({
  submit,
  extensions: {
    fileUpload: {
      config: {
        upload: async (attrs: FileAttributes) => {
          try {
            const {uploaded, url} = await uploadFile("https://cdn.satellite.earth", attrs.file)
            if (!uploaded) return {error: "Server refused the file"}
            return {result: {url, tags: []}}
          } catch (e) {
            return {error: String(e)}
          }
        },
        onDrop() { uploading.set(true) },
        onComplete() { uploading.set(false) },
        onUploadError(ed, task) {
          ed.commands.removeFailedUploads()
          uploading.set(false)
        },
      },
    },
  },
})

// Trigger the file picker programmatically:
editor.chain().selectFiles().run()
```

### 4. @-mention autocomplete with custom node view

```ts
import {get} from "svelte/store"
import type {NodeViewProps} from "@welshman/editor"
import {WelshmanExtension, MentionSuggestion} from "@welshman/editor"
import {profileSearch, deriveProfileDisplay} from "@welshman/app"
import {Router} from "@welshman/router"

const CustomMentionNodeView = ({node}: NodeViewProps) => {
  const dom = document.createElement("span")
  dom.classList.add("tiptap-object")

  const display = deriveProfileDisplay(node.attrs.pubkey)
  const unsub = display.subscribe($d => { dom.textContent = "@" + $d })

  return {
    dom,
    destroy: unsub,
    selectNode()   { dom.classList.add("tiptap-active") },
    deselectNode() { dom.classList.remove("tiptap-active") },
  }
}

WelshmanExtension.configure({
  submit,
  extensions: {
    nprofile: {
      extend: {
        addNodeView: () => CustomMentionNodeView,
        addProseMirrorPlugins() {
          return [
            MentionSuggestion({
              editor: (this as any).editor,
              search: (term: string) => get(profileSearch).searchValues(term),
              getRelays: (pubkey: string) => Router.get().FromPubkeys([pubkey]).getUrls(),
              // Optional: render a richer item in the dropdown
              createSuggestion: (pubkey: string) => {
                const el = document.createElement("span")
                el.textContent = pubkey.slice(0, 12) + "…"
                return el
              },
            }),
          ]
        },
      },
    },
  },
})
```

### 5. Reading content and tags after submit

```ts
const submit = () => {
  // Plain text with newlines between paragraphs
  const content = editor.getText({blockSeparator: "\n"}).trim()

  // NIP-10 / NIP-27 tags built from inline nostr objects
  const tags = editor.storage.nostr.getEditorTags()

  // Full ProseMirror JSON (for saving draft state)
  const json = editor.getJSON()

  // Restore from saved JSON
  editor.commands.setContent(json)
}
```

### 6. Tracking word / character count

```ts
import {writable} from "svelte/store"
import {Editor, WelshmanExtension} from "@welshman/editor"

const wordCount = writable(0)
const charCount = writable(0)

const editor = new Editor({
  element,
  extensions: [WelshmanExtension.configure({submit})],
  onUpdate({editor}) {
    wordCount.set(editor.storage.wordCount.words)
    charCount.set(editor.storage.wordCount.chars)
  },
})
```

---

## Integration Notes

- **`@welshman/app`** — `profileSearch` and `deriveProfileDisplay` are the typical sources for mention autocomplete data and display names.
- **`@welshman/router`** — `Router.get().FromPubkeys([pubkey]).getUrls()` provides the relay hints encoded into nprofile bech32 strings.
- **`@welshman/util`** — `fromNostrURI` is used internally by `EventNodeView` to strip the `nostr:` scheme before displaying.
- **`nostr-editor`** — `WelshmanExtension` extends `NostrExtension` from this package. Storage at `editor.storage.nostr` (including `getEditorTags()`) is provided by `nostr-editor`, not welshman itself.
- **`@tiptap/core`** — `Editor`, `NodeViewProps`, and all extension primitives come from Tiptap. Welshman does not re-export every Tiptap helper; import additional ones directly from `@tiptap/core` as needed.

---

## Gotchas & Tips

- **`submit` is required.** `WelshmanExtension.configure({submit})` will throw during editor initialization (when extensions are registered) if `submit` is omitted, not at the `configure()` call site.
- **Extension options are deep-merged, not replaced.** User-supplied `extensions` options are merged with welshman defaults via `deepMergeLeft`, so you only need to specify the keys you want to change. Supplying `false` for a key fully disables that extension.
- **Default node views are plain DOM.** The built-in `MentionNodeView`, `MediaNodeView`, etc. render minimal pill text. Override them via the `extend.addNodeView` pattern (see pattern 4) to render framework components, avatars, or rich previews.
- **`selectFiles()` command.** To open a file picker without a UI button inside the editor, call `editor.chain().selectFiles().run()` from any external button click handler.
- **CSS variables.** The bundled `index.css` exposes `--tiptap-object-bg`, `--tiptap-object-fg`, `--tiptap-active-bg`, `--tiptap-active-fg` for theming pills and the suggestion dropdown without overriding classes.
- **`tiptap-uploading` animation.** While a file is being uploaded, `MediaNodeView` adds the `.tiptap-uploading` class which triggers a pulsing opacity animation defined in `index.css`. No manual wiring is needed.
- **Tippy appends to dialog when open.** `TippySuggestion` checks for an open `<dialog>` element and appends the suggestion popover inside it to avoid z-index stacking issues in modal composers.
- **`getEditorTags()` returns NIP-10/27 tags.** This method on `editor.storage.nostr` collects all inline nostr objects (mentions, links, embeds) and returns the appropriate `p`, `e`, `a`, `t`, `r` tags for the published event. Always call this when building the event to publish.
- **Initial content.** Pass either a plain string or a ProseMirror JSON object to `new Editor({content})`. To restore a draft, save `editor.getJSON()` and pass it back as `content`.
- **`removeFailedUploads()` command.** Call `editor.commands.removeFailedUploads()` in `onUploadError` to clean up any partially-inserted upload nodes so the composer stays in a clean state.
