import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env, assertRequiredSecrets } from "./config/env.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { startArrivalEscalationScheduler } from "./services/escalation.service.js";

// Crash early on an insecure production configuration (e.g. missing JWT_SECRET)
// before any client can connect.
assertRequiredSecrets();

await connectDB();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientUrl,
    credentials: true
  }
});

registerSocketHandlers(io);
app.set("io", io);

// Background safety scheduler: escalate trips with no safe-arrival confirmation.
const escalationTimer = startArrivalEscalationScheduler(io);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

// Graceful shutdown: stop the scheduler, refuse new connections and drain
// in-flight requests, close sockets, then the DB — so a container stop
// (SIGTERM) or Ctrl-C (SIGINT) exits cleanly instead of dropping live traffic.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} received — closing gracefully…`);

  clearInterval(escalationTimer);

  // Force-exit if a hung connection prevents a clean close within 10s.
  const force = setTimeout(() => {
    console.error("[shutdown] forced exit after timeout");
    process.exit(1);
  }, 10_000);
  force.unref?.();

  try {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close(false);
    console.log("[shutdown] clean");
    process.exit(0);
  } catch (err) {
    console.error(`[shutdown] error: ${err.message}`);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
