import type { Request, Response } from "express";
import { addSubscriber } from "../services/realtime.service.js";

export function getRealtimeStream(req: Request, res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      addSubscriber(controller as ReadableStreamDefaultController<Uint8Array>);
      controller.enqueue(encoder.encode("event: ping\ndata: connected\n\n"));
    },
  });

  const reader = stream.getReader();
  const pump = (): void => {
    reader.read().then(({ done, value }) => {
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      pump();
    });
  };
  pump();

  req.on("close", () => {
    reader.cancel();
  });
}
