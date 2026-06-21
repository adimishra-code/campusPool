export function notFound(req, _res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || "Server error",
    errors: error.errors || undefined,
    // Optional structured hint (e.g. { needsEmailVerification, email }) so the
    // client can branch on auth errors without parsing the message string.
    ...(error.payload || {})
  });
}
