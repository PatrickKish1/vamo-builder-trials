const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function addSubscriber(controller: ReadableStreamDefaultController<Uint8Array>) {
  subscribers.add(controller);
}

export function removeSubscriber(controller: ReadableStreamDefaultController<Uint8Array>) {
  subscribers.delete(controller);
}

export function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  for (const sub of subscribers) {
    try { sub.enqueue(encoder.encode(payload)); } catch {}
  }
}


