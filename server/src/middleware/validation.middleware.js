import { validationResult } from "express-validator";

/**
 * Factory that returns an Express middleware which runs the given
 * express-validator rule chains and then short-circuits with a 422
 * if any of them failed.
 *
 * Usage:
 *   router.post("/", protect, validate(offerTripRules), offerTrip);
 *   router.get("/find", protect, validate(findTripsRules, ["query"]), findTrips);
 *
 * The optional `locations` argument is accepted for call-site readability
 * (e.g. ["query"]) but is not required: each express-validator chain already
 * encodes the request location it targets (body/query/param), so we simply
 * run every supplied chain.
 *
 * @param {Array} rules - array of express-validator validation chains
 * @param {Array<string>} [locations] - optional, informational only
 * @returns {import("express").RequestHandler}
 */
export function validate(rules = [], locations) {
  const chains = Array.isArray(rules) ? rules : [rules];

  return async function runValidation(req, _res, next) {
    try {
      for (const chain of chains) {
        if (chain && typeof chain.run === "function") {
          await chain.run(req);
        }
      }

      const result = validationResult(req);
      if (result.isEmpty()) return next();

      const error = new Error("Validation failed");
      error.statusCode = 422;
      error.errors = result.array();
      return next(error);
    } catch (err) {
      return next(err);
    }
  };
}

export default validate;
