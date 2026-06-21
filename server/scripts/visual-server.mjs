// Throwaway dev server for visual/responsive verification.
// Boots the real API against an in-memory MongoDB, seeds demo data, and serves
// on :5000 so a headless browser can drive the real UI. Not used in production.
import { spawn } from "child_process";
import http from "http";
import { MongoMemoryServer } from "mongodb-memory-server";

const mem = await MongoMemoryServer.create();
const uri = mem.getUri("campuspool_visual");
process.env.MONGO_URI = uri;
process.env.CLIENT_URL = "http://localhost:5173";
process.env.NODE_ENV = "development";
process.env.PORT = "5000";

// Seed using the existing seed script against the same in-memory URI.
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["src/seed.js"], {
    env: { ...process.env, MONGO_URI: uri },
    stdio: "inherit"
  });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed exited ${code}`))));
});

// Now bring up the real app + sockets (dynamic import so env is set first).
const { default: app } = await import("../src/app.js");
const { connectDB } = await import("../src/config/db.js");
const { Server } = await import("socket.io");
const { registerSocketHandlers } = await import("../src/sockets/index.js");

await connectDB();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL, credentials: true } });
registerSocketHandlers(io);
app.set("io", io);
server.listen(5000, () => console.log("[visual-server] API + seed ready on http://localhost:5000"));

process.on("SIGTERM", async () => { await mem.stop(); process.exit(0); });
