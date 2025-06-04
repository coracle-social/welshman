# Task Queue

The `TaskQueue` class provides a simple queue processing system with batched operations and throttling. It's designed to handle asynchronous operations efficiently while maintaining control over processing rates and resource usage.

## API

```typescript
// Task queue options
export type TaskQueueOptions<Item> = {
  batchSize: number;
  processItem: (item: Item) => unknown;
};

// Task queue implementation
export declare class TaskQueue<Item> {
  constructor(options: TaskQueueOptions<Item>);
  push(item: Item): void;
  remove(item: Item): void;
  subscribe(subscriber: (item: Item) => void): () => void;
  process(): Promise<void>;
  stop(): void;
  start(): void;
  clear(): void;
}
```

## Example

```typescript
import { TaskQueue } from '@welshman/lib';

// Create a task queue that processes 3 items at a time
const queue = new TaskQueue({
  batchSize: 3,
  processItem: async (message: string) => {
    console.log('Processing:', message);
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});

// Add items to the queue
queue.push('Message 1');
queue.push('Message 2');
queue.push('Message 3');
queue.push('Message 4');

// Items will be processed in batches of 3
// Output: "Processing: Message 1", "Processing: Message 2", "Processing: Message 3"
// Then: "Processing: Message 4"
```
