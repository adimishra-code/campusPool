import multer from "multer";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    const err = new Error("Only JPG, PNG, WEBP, or PDF files up to 5MB are allowed");
    err.statusCode = 400;
    cb(err);
  }
});

// Wraps multer so multer errors surface as 400s through the central error handler.
export function uploadSingle(field = "document") {
  const handler = multerInstance.single(field);
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (err) {
        err.statusCode = err.statusCode || 400;
        return next(err);
      }
      next();
    });
}
