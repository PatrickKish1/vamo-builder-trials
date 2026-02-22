/**
 * SSE subscribers and broadcast for file events (file:created, file:updated, etc.).
 */
type Controller = ReadableStreamDefaultController<Uint8Array>;

const subscribers = new Set<Controller>();

export function addSubscriber(controller: Controller): void {
  subscribers.add(controller);
}

export function removeSubscriber(controller: Controller): void {
  subscribers.delete(controller);
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(payload);
  for (const sub of subscribers) {
    try {
      sub.enqueue(encoded);
    } catch {
      subscribers.delete(sub);
    }
  }
}
