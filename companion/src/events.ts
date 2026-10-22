import WebSocket from "ws";

import type { LcuClient } from "./lcu.ts";

/**
 * The client pushes every internal event over a WebSocket on the same port.
 * Subscribing to OnJsonApiEvent gets all of them; messages arrive as
 *
 *   [8, "OnJsonApiEvent", { uri, eventType, data }]
 *
 * Nothing here assumes which phase names exist — the caller is handed every
 * gameflow phase change and decides.
 */
const EVENT_OPCODE = 8;
const SUBSCRIBE_OPCODE = 5;
const GAMEFLOW_PHASE_URI = "/lol-gameflow/v1/gameflow-phase";

export interface GameflowEvent {
  phase: string;
  at: Date;
}

export function watchGameflow(
  client: LcuClient,
  handlers: {
    onPhase: (event: GameflowEvent) => void;
    onOpen?: () => void;
    onClose?: (reason: string) => void;
  },
): () => void {
  const socket = new WebSocket(client.origin.replace("https://", "wss://"), {
    headers: { Authorization: client.authHeader },
    // Same loopback-only self-signed certificate as the HTTP side.
    rejectUnauthorized: false,
  });

  socket.on("open", () => {
    socket.send(JSON.stringify([SUBSCRIBE_OPCODE, "OnJsonApiEvent"]));
    handlers.onOpen?.();
  });

  socket.on("message", (raw: Buffer) => {
    const phase = gameflowPhaseFrom(raw.toString("utf8"));
    if (phase !== null) handlers.onPhase({ phase, at: new Date() });
  });

  socket.on("close", () => handlers.onClose?.("closed"));
  socket.on("error", (error: Error) => handlers.onClose?.(error.message));

  return () => socket.close();
}

/** Exported for tests: pulls a phase out of a raw socket frame, or null. */
export function gameflowPhaseFrom(frame: string): string | null {
  if (frame.length === 0) return null;

  let message: unknown;
  try {
    message = JSON.parse(frame);
  } catch {
    return null;
  }

  if (!Array.isArray(message) || message[0] !== EVENT_OPCODE) return null;

  const payload = message[2];
  if (typeof payload !== "object" || payload === null) return null;

  const { uri, data } = payload as { uri?: unknown; data?: unknown };
  if (uri !== GAMEFLOW_PHASE_URI) return null;

  return typeof data === "string" ? data : null;
}
