import {describe, it, expect} from "vitest"
import {Editor} from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import {TextSelection} from "@tiptap/pm/state"
import {CodeInline} from "../src/extensions/CodeInline.js"

// Puts the cursor at the end of the code inline's content. The core keymap is disabled
// so that only CodeInline's shortcut runs, since the default backspace depends on layout.
const makeEditor = (code: string) => {
  const editor = new Editor({
    enableCoreExtensions: {keymap: false},
    extensions: [Document, Paragraph, Text, CodeInline],
  })

  const {schema} = editor

  editor.commands.setContent(
    schema.nodes.doc
      .create(null, [
        schema.nodes.paragraph.create(null, [
          schema.text("hi "),
          schema.nodes.codeInline.create(null, code ? schema.text(code) : null),
          schema.text(" yo"),
        ]),
      ])
      .toJSON(),
  )

  const pos = "hi ".length + 2 + code.length

  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)))

  return editor
}

// Returns whether a keydown handler took the key, which keeps the browser from deleting too
const backspace = (editor: Editor) =>
  Boolean(
    editor.view.someProp("handleKeyDown", f =>
      f(editor.view, new KeyboardEvent("keydown", {key: "Backspace"})),
    ),
  )

const getContent = (editor: Editor) => editor.getJSON().content?.[0]?.content

describe("CodeInline", () => {
  it("leaves a non-empty code inline alone on backspace", () => {
    const editor = makeEditor("ab")

    expect(backspace(editor)).toBe(false)
    expect(getContent(editor)).toEqual([
      {type: "text", text: "hi "},
      {type: "codeInline", content: [{type: "text", text: "ab"}]},
      {type: "text", text: " yo"},
    ])
  })

  it("removes an empty code inline on backspace", () => {
    const editor = makeEditor("")

    expect(backspace(editor)).toBe(true)
    expect(getContent(editor)).toEqual([{type: "text", text: "hi  yo"}])
  })
})
