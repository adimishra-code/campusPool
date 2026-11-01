import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env, assertRequiredSecrets } from "./config/env.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { startArrivalEscalationScheduler } from "./services/escalation.service.js";
import College from "./models/College.js";
import FeatureFlag from "./models/FeatureFlag.js";

// Verify configuration requirements before starting.
assertRequiredSecrets();

await connectDB();

// Initialize reference seed data once at boot
await Promise.all([
  College.initializeDefaults().catch(console.error),
  FeatureFlag.initializeDefaults().catch(console.error)
]);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientUrl,
    credentials: true
  }
});

registerSocketHandlers(io);
app.set("io", io);

// Start background safety scheduler for overdue arrival escalations.
const escalationTimer = startArrivalEscalationScheduler(io);

server.listen(env.port, "0.0.0.0", () => {
  console.log(`API listening on port ${env.port}`);
});

// Graceful shutdown: stops scheduler, closes server, sockets, and DB.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} received — closing gracefully…`);

  clearInterval(escalationTimer);

  // Force-exit if clean shutdown hangs.
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
