import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { startArrivalEscalationScheduler } from "./services/escalation.service.js";

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
startArrivalEscalationScheduler(io);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
