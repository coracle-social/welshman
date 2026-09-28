# @welshman/editor

[![version](https://badgen.net/npm/v/@welshman/editor)](https://npmjs.com/package/@welshman/editor)

`@welshman/editor` is a nostr text editor built on [Tiptap](https://tiptap.dev) and [nostr-editor](https://github.com/cesardeazevedo/nostr-editor). `WelshmanExtension` registers mentions, event and address embeds, file upload, lightning invoices, history, a placeholder, inline code and a word count, and each can be configured or disabled under `extensions`.

This package powers the editors of [Coracle](https://coracle.social) and [Flotilla](https://flotilla.social).

## Installation

```bash
npm install @welshman/editor
```

## Example

```typescript
import {get} from "svelte/store"
import type {Writable} from "svelte/store"
import type {NodeViewProps} from "@tiptap/core"
import type {FileAttributes} from "@welshman/editor"
import {Editor, MentionSuggestion, WelshmanExtension} from "@welshman/editor"
import {Profiles, Publisher, RelayLists} from "@welshman/app"
import {NOTE, makeEvent} from "@welshman/util"

export const MentionNodeView = ({node}: NodeViewProps) => {
  const dom = document.createElement("span")
  const display = app.use(Profiles).display(node.attrs.pubkey).$

  dom.classList.add("tiptap-object")

  const unsubDisplay = display.subscribe($display => {
    dom.textContent = "@" + $display
  })

  return {
    dom,
    destroy: () => {
      unsubDisplay()
    },
    selectNode() {
      dom.classList.add("tiptap-active")
    },
    deselectNode() {
      dom.classList.remove("tiptap-active")
    },
  }
}

export const makeEditor = async ({
  content = "",
  submit,
  uploading,
  charCount,
  wordCount,
}: {
  content?: string
  submit: () => void
  uploading?: Writable<boolean>
  charCount?: Writable<number>
  wordCount?: Writable<number>
}) => {
  return new Editor({
    content, // Initial content, either a string or editor JSON
    autofocus: true,
    element: document.createElement("div"),
    extensions: [
      WelshmanExtension.configure({
        submit,
        extensions: {
          placeholder: {
            config: {
              placeholder: "What's up?",
            },
          },
          breakOrSubmit: {
            config: {
              aggressive: true, // If this is a chat-type interface
            },
          },
          fileUpload: {
            config: {
              upload: async (attrs: FileAttributes) => {
                const server = "https://cdn.satellite.earth"

                try {
                  let {uploaded, url, ...task} = await uploadFile(server, attrs.file)

                  if (!uploaded) {
                    return {error: "Server refused to process the file"}
                  }

                  if (new URL(url).pathname.split(".").length === 1) {
                    url += "." + attrs.file.type.split("/")[1]
                  }

                  const result = {...task, url, tags: []}

                  return {result}
                } catch (e) {
                  return {error: e.toString()}
                }
              },
              onDrop() {
                uploading?.set(true)
              },
              onComplete() {
                uploading?.set(false)
              },
              onUploadError(currentEditor, task) {
                currentEditor.commands.removeFailedUploads()
                alert("Failed to upload file")
                uploading?.set(false)
              },
            },
          },
          nprofile: {
            extend: {
              addNodeView: () => MentionNodeView,
              addProseMirrorPlugins() {
                return [
                  MentionSuggestion({
                    editor: (this as any).editor,
                    search: (term: string) =>
                      get(app.use(Profiles).profileSearch).searchValues(term),
                    getRelays: (pubkey: string) =>
                      app.use(RelayLists).get(pubkey)?.writeUrls() ?? [],
                    createSuggestion: (value: string) => {
                      const target = document.createElement("div")

                      target.textContent = value

                      return target
                    },
                  }),
                ]
              },
            },
          },
        },
      }),
    ],
    onUpdate({editor}) {
      wordCount?.set(editor.storage.wordCount.words)
      charCount?.set(editor.storage.wordCount.chars)
    },
  })
}

const editor = makeEditor({
  submit: async () => {
    const ed = await editor
    const content = ed.getText({blockSeparator: "\n"}).trim()
    const tags = ed.storage.nostr.getEditorTags()
    const event = makeEvent(NOTE, {content, tags})

    app.use(Publisher).publish({event, relays: [/* ... */]})

    ed.chain().clearContent().run()
  },
})

// Opens the file picker
const uploadFiles = () => editor.then(ed => ed.chain().selectFiles().run())
```
