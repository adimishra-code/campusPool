import { io } from "socket.io-client";

let socket;

// Connect with credentials so the browser sends the httpOnly auth cookie on the
// Socket.IO handshake; the server reads the JWT from that cookie. `token` is
// accepted for back-compat but is no longer required (the cookie is preferred).
export function connectSocket(token) {
  if (socket?.connected) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
    withCredentials: true,
    ...(token ? { auth: { token } } : {}),
    transports: ["websocket"]
  });
  return socket;
}

export function getSocket() {
  return socket;
}
