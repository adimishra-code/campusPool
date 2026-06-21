import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

const BUCKET = "documents";

function getBucket() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("Database connection not ready for file storage");
  return new GridFSBucket(db, { bucketName: BUCKET });
}

// Store a buffer in GridFS; resolves with the new file's ObjectId.
export function putFile({ buffer, filename, contentType, metadata }) {
  return new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(filename, { contentType, metadata });
    stream.on("error", reject);
    stream.on("finish", () => resolve(stream.id));
    stream.end(buffer);
  });
}

export async function getFileInfo(fileId) {
  if (!ObjectId.isValid(fileId)) return null;
  const files = await getBucket()
    .find({ _id: new ObjectId(fileId) })
    .toArray();
  return files[0] || null;
}

export function openDownloadStream(fileId) {
  return getBucket().openDownloadStream(new ObjectId(fileId));
}
