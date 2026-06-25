import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AUTH_COOKIE } from "../utils/cookies.js";
import Trip from "../models/Trip.js";

// Minimal cookie-header parser (avoids a dependency just to read one cookie).
function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/**
 * Socket.IO connection layer.
 *
 * Sockets can join a trip's chat room only if the authenticated user is the host or
 * an approved/completed passenger. Messages are persisted via REST and broadcast
 * to the `trip:<id>` room.
 */
async function canAccessTrip(userId, tripId) {
  const trip = await Trip.findById(tripId).select("host passengers").lean();
  if (!trip) return false;
  const id = String(userId);
  if (String(trip.host) === id) return true;
  return (trip.passengers || []).some(
    (p) => String(p.user) === id && ["approved", "completed"].includes(p.status)
  );
}

export function registerSocketHandlers(io) {
  io.use((socket, next) => {
    try {
      // Prefer the httpOnly auth cookie (sent on the handshake when the client
      // connects with withCredentials); fall back to an explicit auth token for
      // non-browser clients and back-compat.
      const token =
        readCookie(socket.handshake.headers?.cookie, AUTH_COOKIE) || socket.handshake.auth?.token;
      if (!token) return next(new Error("Socket authentication required"));
      socket.user = jwt.verify(token, env.jwtSecret);
      next();
    } catch {
      next(new Error("Invalid socket token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (socket.user.role === "admin") socket.join("admin:ops");

    // Join a trip's chat room only if the user is a participant.
    const joinTripRoom = async ({ tripId }) => {
      if (!tripId) return;
      try {
        if (await canAccessTrip(socket.user.id, tripId)) {
          socket.join(`trip:${tripId}`);
          socket.emit("chat:joined", { tripId });
        }
      } catch {
        /* ignore */
      }
    };
    socket.on("chat:join", joinTripRoom);
    socket.on("trip:join", joinTripRoom);

    // Live typing indicator (relayed only to participants already in the room).
    socket.on("chat:typing", ({ tripId }) => {
      if (tripId)
        socket.to(`trip:${tripId}`).emit("chat:typing", { tripId, userId: socket.user.id });
    });

    // Live trip location — only a verified participant can share, and it is
    // relayed to others in the (participant-gated) trip room.
    socket.on("trip:location", async ({ tripId, coordinates }) => {
      if (!tripId || !Array.isArray(coordinates)) return;
      if (await canAccessTrip(socket.user.id, tripId)) {
        socket
          .to(`trip:${tripId}`)
          .emit("trip:location", { tripId, userId: socket.user.id, coordinates, at: Date.now() });
      }
    });

    socket.on("notification:push-token", ({ token }) => {
      socket.data.pushToken = token;
    });

    socket.on("disconnect", () => {});
  });
}
