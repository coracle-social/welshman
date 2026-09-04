import {mergeAttributes, Node} from "@tiptap/core"
import type {Editor} from "@tiptap/core"
import {renderCommandInvocation} from "@welshman/util"
import {TippySuggestion} from "../plugins/TippySuggestion.js"
import type {TippySuggestionOptions} from "../plugins/TippySuggestion.js"

export type CommandAttributes = {
  command: string
  pubkey?: string
}

// An atom holding a command trigger. Arguments follow it as ordinary content, so a
// pubkey argument is just a mention, and renderText emits the invocation's canonical
// text form, which is what an executor that knows nothing about this client reads.
export const CommandExtension = Node.create({
  name: "command",
  atom: true,
  inline: true,
  group: "inline",
  selectable: true,
  priority: 1000,
  addAttributes() {
    return {
      command: {default: undefined},
      pubkey: {default: undefined},
    }
  },
  parseHTML() {
    return [{tag: `span[data-type="${this.name}"]`}]
  },
  renderHTML({node, HTMLAttributes}) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {"data-type": this.name, class: "tiptap-object"}),
      renderCommandInvocation(node.attrs.command),
    ]
  },
  renderText({node}) {
    const {command, pubkey} = node.attrs

    return renderCommandInvocation(command, pubkey)
  },
})

export type CommandSuggestionOptions = Partial<TippySuggestionOptions> & {
  editor: Editor
  search: (term: string) => string[]
  getAttributes: (value: string) => CommandAttributes | undefined
}

// An invocation is only valid at the very start of the content, so only suggest one there
export const CommandSuggestion = (options: CommandSuggestionOptions) =>
  TippySuggestion({
    char: "/",
    name: "command",
    // A bare slash should list what's available — that's how a space's commands are found
    showOnEmpty: true,
    allow: ({range}) => range.from === 1,
    select: (value: string, props: any) => {
      const attrs = options.getAttributes(value)

      if (attrs) {
        return props.command(attrs)
      }
    },
    ...options,
  })
