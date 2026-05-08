import type { Response } from "express";

// Lightweight pub/sub for SSE clients on the public status page.
// Rooms: a per-campus slug, plus a wildcard "*" for the all-campuses view.

type Client = {
  id: number;
  res: Response;
  rooms: Set<string>;
};

const clients = new Map<number, Client>();
let nextId = 1;

export function addClient(res: Response, rooms: string[]): number {
  const id = nextId++;
  clients.set(id, { id, res, rooms: new Set(rooms) });
  return id;
}

export function removeClient(id: number): void {
  clients.delete(id);
}

export function broadcast(rooms: string[], event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    const matches = rooms.some((r) => client.rooms.has(r) || client.rooms.has("*"));
    if (!matches) continue;
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client.id);
    }
  }
}

// Heartbeat keeps proxies and load balancers from killing idle SSE connections.
setInterval(() => {
  for (const client of clients.values()) {
    try {
      client.res.write(": ping\n\n");
    } catch {
      clients.delete(client.id);
    }
  }
}, 25_000).unref();
