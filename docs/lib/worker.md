# Worker

The Worker class provides a robust queue processing system with batched operations, throttling, and message routing capabilities. It's designed to handle asynchronous operations efficiently while maintaining control over processing rates and resource usage.

## Overview

```typescript
class Worker<T> {
  constructor(readonly opts: WorkerOpts<T> = {})
}
```

The Worker class accepts messages of type `T` and processes them according to configured options and handlers.

## Configuration

```typescript
type WorkerOpts<T> = {
  // Function to determine routing key for messages
  getKey?: (x: T) => any

  // Function to check if message should be deferred
  shouldDefer?: (x: T) => boolean

  // Maximum messages to process in one batch
  chunkSize?: number // default: 50

  // Milliseconds between processing batches
  delay?: number // default: 50
}
```

## Basic Usage

```typescript
// Create worker for processing messages
const worker = new Worker<Message>({
  chunkSize: 10,
  delay: 100,
  getKey: msg => msg.type
})

// Add message handlers
worker.addHandler('email', async (msg) => {
  await sendEmail(msg)
})

worker.addHandler('notification', async (msg) => {
  await sendNotification(msg)
})

// Add messages to queue
worker.push({
  type: 'email',
  content: 'Hello'
})
```

## Features

### Message Routing

Messages can be routed to specific handlers based on a key:

```typescript
const worker = new Worker<Task>({
  getKey: task => task.priority
})

// Handle high priority tasks
worker.addHandler('high', async (task) => {
  await processUrgent(task)
})

// Handle normal priority tasks
worker.addHandler('normal', async (task) => {
  await processNormal(task)
})
```

### Global Handlers

Handle all messages regardless of routing key:

```typescript
worker.addGlobalHandler(async (message) => {
  console.log('Processing:', message)
})
```

### Message Deferral

Defer processing of messages that aren't ready:

```typescript
const worker = new Worker<Task>({
  shouldDefer: (task) => !task.isReady(),
  delay: 1000
})

worker.push(task) // Will retry until task.isReady()
```

### Flow Control

Control message processing:

```typescript
// Pause processing
worker.pause()

// Resume processing
worker.resume()

// Clear queue
worker.clear()
```
