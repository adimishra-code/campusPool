// NoSQL (MongoDB operator) injection guard.
//
// MongoDB has no SQL, so the relevant attack is "query operator injection":
// an attacker sends a JSON object like { "$gt": "" } or a dotted key where the
// server expects a scalar, hoping it reaches a Mongo query as an operator.
// This middleware recursively strips any key that starts with "$" or contains
// "." from req.body, req.query and req.params, neutralising the payload before
// it can reach Mongoose. Applied globally as defense-in-depth (per-field
// validation already rejects most of these, but this covers everything).

function scrub(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 8) return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    const value = obj[key];
    if (value && typeof value === "object") scrub(value, depth + 1);
  }
}

export function mongoSanitize(req, _res, next) {
  scrub(req.body);
  scrub(req.query); // Express 4 req.query is a mutable plain object
  scrub(req.params);
  next();
}

export default mongoSanitize;
