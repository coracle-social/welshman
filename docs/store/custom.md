# Custom Store

Utility for creating custom Svelte stores with start/stop lifecycle and optional throttling.

## Functions

### custom(start, options)

Creates a custom store that starts when first subscribed and stops when last subscriber unsubscribes.

**Parameters:**
- `start` - Function called when first subscriber is added. Receives a `set` function and should return an unsubscriber function
- `options` - Optional configuration object

**Options:**
- `throttle` - Throttle subscriber notifications (milliseconds)
- `onUpdate` - Callback function called when store value is set

**Returns:** WritableWithGetter store with `get()`, `set()`, `update()`, and `subscribe()` methods

## Example

```typescript
import {custom} from "@welshman/store"

// Create a store that tracks window width
const windowWidth = custom(
  set => {
    const updateWidth = () => set(window.innerWidth)

    // Set initial value
    updateWidth()

    // Listen for resize events
    window.addEventListener('resize', updateWidth)

    // Return cleanup function
    return () => window.removeEventListener('resize', updateWidth)
  },
  {
    throttle: 100, // Throttle updates to every 100ms
    onUpdate: (width) => console.log(`Window width: ${width}px`)
  }
)

// Subscribe to changes
const unsubscribe = windowWidth.subscribe(width => {
  console.log("Width changed:", width)
})

// Get current value
console.log("Current width:", windowWidth.get())

// Clean up
unsubscribe()
```
