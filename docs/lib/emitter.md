# Event Emitter

The `Emitter` class extends Node.js EventEmitter to automatically emit all events to `'*'` listeners in addition to specific event listeners.

## API

```typescript
// Extended EventEmitter that also emits all events to '*' listeners
export declare class Emitter extends EventEmitter {
  // Emits an event to listeners and to '*' listeners
  emit(type: string, ...args: any[]): boolean;
}
```

## Example

```typescript
import { Emitter } from '@welshman/lib';

const emitter = new Emitter();

// Listen for specific events
emitter.on('message', (data) => {
  console.log('Message:', data);
});

// Listen for all events with '*'
emitter.on('*', (eventType, ...args) => {
  console.log('Event:', eventType, args);
});

// Emit an event - triggers both listeners
emitter.emit('message', 'Hello world');
// Output:
// Event: message ['Hello world']
// Message: Hello world
```