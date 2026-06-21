import Report from "../models/Report.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";

/**
 * Recompute and persist a user's safety score (0-100, higher = safer).
 *
 * The score starts at 100 and is reduced by safety signals:
 *   - actioned reports against the user   (strong signal)
 *   - open / reviewing reports            (weak, provisional signal)
 *   - reliability lapses (no-shows, cancellations)
 *   - poor safe-arrival compliance as a host (only once they have a track record)
 *
 * Returns the persisted score, or null if the user no longer exists.
 */
export async function recomputeSafetyScore(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  const [actionedReports, pendingReports, completedAsHost, confirmedArrivals] = await Promise.all([
    Report.countDocuments({ reportedUser: userId, status: "actioned" }),
    Report.countDocuments({ reportedUser: userId, status: { $in: ["open", "reviewing"] } }),
    Trip.countDocuments({ host: userId, status: "completed" }),
    Trip.countDocuments({
      host: userId,
      status: "completed",
      "safety.arrivalConfirmedAt": { $exists: true, $ne: null }
    })
  ]);

  const noShows = user.reliabilityStats?.noShows || 0;
  const cancellations = user.reliabilityStats?.cancellations || 0;

  // Only penalise arrival compliance once the host has a meaningful track record.
  let compliancePenalty = 0;
  if (completedAsHost >= 3) {
    const complianceRate = confirmedArrivals / completedAsHost;
    compliancePenalty = Math.round((1 - complianceRate) * 10);
  }

  const score =
    100 -
    actionedReports * 20 -
    pendingReports * 5 -
    noShows * 5 -
    cancellations * 3 -
    compliancePenalty;

  user.safetyScore = Math.max(0, Math.min(100, score));
  await user.save();
  return user.safetyScore;
}
