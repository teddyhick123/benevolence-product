// lib/import/progress-emitter.ts
// Server-Sent Events (SSE) helper for streaming import progress

export interface ProgressEvent {
  type: 'extraction' | 'validation' | 'loading' | 'complete' | 'error' | 'heartbeat';
  entity?: string;
  processed?: number;
  total?: number;
  percent?: number;
  message?: string;
  etaSeconds?: number;
}

export class ImportProgressEmitter {
  // Map from importJobId → set of SSE controllers
  private static clients = new Map<string, Set<ReadableStreamDefaultController>>();

  /**
   * Returns an SSE ReadableStream for the given import job.
   * Sends a heartbeat every 15 seconds to keep the connection alive.
   */
  static subscribe(importJobId: string): ReadableStream {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController;
    let heartbeatTimer: ReturnType<typeof setInterval>;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;

        // Register this client
        if (!ImportProgressEmitter.clients.has(importJobId)) {
          ImportProgressEmitter.clients.set(importJobId, new Set());
        }
        ImportProgressEmitter.clients.get(importJobId)!.add(controller);

        // Send initial connection event
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));

        // Heartbeat every 15 seconds
        heartbeatTimer = setInterval(() => {
          try {
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
          } catch {
            // Stream may be closed
            clearInterval(heartbeatTimer);
          }
        }, 15_000);
      },
      cancel() {
        clearInterval(heartbeatTimer);
        ImportProgressEmitter.unsubscribe(importJobId, controller);
      },
    });

    return stream;
  }

  /**
   * Broadcasts a progress event to all clients subscribed to this import job.
   */
  static emit(importJobId: string, event: ProgressEvent): void {
    const controllers = ImportProgressEmitter.clients.get(importJobId);
    if (!controllers || controllers.size === 0) return;

    const encoder = new TextEncoder();
    const data = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

    const deadControllers: ReadableStreamDefaultController[] = [];
    for (const ctrl of controllers) {
      try {
        ctrl.enqueue(data);
      } catch {
        deadControllers.push(ctrl);
      }
    }

    // Clean up dead connections
    for (const ctrl of deadControllers) {
      controllers.delete(ctrl);
    }
  }

  /**
   * Removes a specific controller from the subscriber set.
   */
  static unsubscribe(importJobId: string, controller: ReadableStreamDefaultController): void {
    const controllers = ImportProgressEmitter.clients.get(importJobId);
    if (controllers) {
      controllers.delete(controller);
      if (controllers.size === 0) {
        ImportProgressEmitter.clients.delete(importJobId);
      }
    }
  }
}
