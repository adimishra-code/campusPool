import { io } from "socket.io-client";

let socket;

export function connectSocket(token) {
  if (socket?.connected) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
    auth: { token },
    transports: ["websocket"]
  });
  return socket;
}

export function getSocket() {
  return socket;
}
