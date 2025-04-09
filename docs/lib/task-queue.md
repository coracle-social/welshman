# Task Queue

The `TaskQueue` class provides a simple queue processing system with batched operations and throttling. It's designed to handle asynchronous operations efficiently while maintaining control over processing rates and resource usage.

## Basic Usage

```typescript
// Create queue for processing messages
const queue = new TaskQueue<number>({
  chunkSize: 10,
  processItem: (n: number) => console.log(n)
})

// Add and remove items to/from queue
worker.push(10)
worker.push(21)
worker.remove(10)
worker.push(57)
```

## Control Methods

Control message processing:

```typescript
// Pause processing
worker.stop()

// Resume processing
worker.start()

// Clear queue
worker.clear()
```

## API Reference

### Constructor

```typescript
class TaskQueue<Item> {
  constructor(readonly options: TaskQueueOptions<Item>) {}
}
```

The TaskQueue class accepts messages of type `Item` and processes them.

### Configuration

```typescript
type TaskQueueOptions<Item> = {
  // How many items to process at a time
  batchSize: number

  // A function for processing items. Any promises returned will be awaited
  processItem: (item: Item) => unknown
}
```

