// Shared in-memory MongoDB lifecycle for the test suites.
process.env.MONGOMS_LAUNCHTIMEOUT = process.env.MONGOMS_LAUNCHTIMEOUT || "60000";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo;

export async function connectTestDB() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("campus_test"));
}

export async function clearTestDB() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}
