# @welshman/editor

[![version](https://badgen.net/npm/v/@welshman/editor)](https://npmjs.com/package/@welshman/editor)

`@welshman/editor` provides a comprehensive Nostr-ready text editor, built on top of [nostr-editor](https://github.com/cesardeazevedo/nostr-editor).

This package powers the editors of [Coracle](https://coracle.social) and [Flotilla](https://flotilla.social).

## Installation

```bash
npm install @welshman/editor
```

## WelshmanExtension

The `WelshmanExtension` is the main entry point of the package, providing a pre-configured collection of extensions optimized for Nostr content creation.

### Configuration

```typescript
interface WelshmanOptions {
  // Required: Function to sign events
  sign: (event: StampedEvent) => Promise<SignedEvent>

  // Required: Handler for submit action
  submit: () => void

  // File upload configuration
  defaultUploadUrl?: string      // Default: "https://nostr.build"
  defaultUploadType?: "nip96" | "blossom" // Default: "nip96"

  // Extension configuration
  extensions?: WelshmanExtensionOptions
}
```

### Included Extensions

The extension bundles and configures multiple TipTap and nostr-editor extensions:

#### Core TipTap Extensions
- Document
- Text
- Paragraph
- History
- CodeBlock
- CodeInline
- Dropcursor
- Gapcursor
- Placeholder

#### Nostr-specific Extensions
- NostrExtension (base)
- Bolt11Extension (Lightning invoices)
- FileUploadExtension
- ImageExtension
- LinkExtension
- NAddrExtension (Nostr addresses)
- NEventExtension (Nostr events)
- NProfileExtension (Nostr profiles)
- TagExtension
- VideoExtension
- NSecRejectExtension

#### Custom Extensions
- BreakOrSubmit (Enter key handling)
- WordCount

### Usage

```typescript
import { Editor } from '@tiptap/core'
import { WelshmanExtension } from '@welshman/editor'

const editor = new Editor({
  extensions: [
    WelshmanExtension.configure({
      // Required: Event signing function
      sign: async (event) => {
        return signEvent(event)
      },

      // Required: Submit handler
      submit: () => {
        handleSubmit(editor.getText())
      },

      // Optional: Custom upload configuration
      defaultUploadUrl: "https://nostr.build",
      defaultUploadType: "nip96",

      // Optional: Extension configuration
      extensions: {
        // Disable specific extensions
        wordCount: false,
        tag: false,

        // Configure extensions
        placeholder: {
          config: {
            placeholder: 'What\'s on your mind?'
          }
        },

        // Extend existing extensions
        codeBlock: {
          extend: {
            renderText: (props) => '```' + props.node.textContent + '```'
          }
        },
        fileUpload: {
          config: {
            immediateUpload: true,
            allowedMimeTypes: [
              "image/jpeg",
              "image/png",
              "video/mp4"
            ]
          }
        }
      }
    })
  ]
})
```

### Extension Configuration

Each extension can be configured using the `WelshmanExtensionOptions`:

```typescript
type WelshmanExtensionOptions = {
  [ExtensionName: string]: {
    // Disable the extension
    false |

    // Configure the extension
    {
      // Extension-specific configuration
      config?: Partial<ExtensionConfig>

      // Extend the extension's functionality
      extend?: Partial<ExtensionAPI>
    }
  }
}
```

### Custom Components

The extension includes Svelte components for rendering various Nostr entities in the editor:
- EditBolt11: Lightning invoice
- EditMedia: Image and video
- EditEvent: Nostr event
- EditMention: Nostr profile mention
