import Trip from "../models/Trip.js";
import User from "../models/User.js";
import MatchEvent from "../models/MatchEvent.js";
import SosEvent from "../models/SosEvent.js";
import Report from "../models/Report.js";

/**
 * Campus ride-share platform analytics.
 *
 * Phase 1: the Uber-era revenue / driver-leaderboard / surge metrics were
 * removed along with the Payment-revenue and Driver models. The overview now
 * reports the metrics that matter for a student carpooling network:
 *   - ridesShared    : completed trips in range
 *   - seatsFilled    : total approved passenger seats across completed trips
 *   - activeHosts    : distinct hosts who offered a trip in range
 *   - carbonSavedKg   : total CO2 saved (sum of Trip.carbonSavedKg)
 *   - verifiedUsers  : users with approved verification (campus trust)
 * plus supporting breakdowns for charts.
 */
export async function platformAnalytics({ from, to }) {
  const range = {
    $gte: from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    $lte: to ? new Date(to) : new Date()
  };

  const [
    ridesShared,
    seatsAndCarbon,
    activeHosts,
    verifiedUsers,
    tripsByStatus,
    tripsByHour,
    userGrowth
  ] = await Promise.all([
    // Completed trips in range = "rides shared"
    Trip.countDocuments({ status: "completed", createdAt: range }),

    // Seats filled (approved passengers) + carbon saved across completed trips
    Trip.aggregate([
      { $match: { status: "completed", createdAt: range } },
      {
        $project: {
          carbonSavedKg: 1,
          approvedSeats: {
            $size: {
              $filter: {
                input: "$passengers",
                as: "p",
                cond: { $in: ["$$p.status", ["approved", "completed"]] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          seatsFilled: { $sum: "$approvedSeats" },
          carbonSavedKg: { $sum: "$carbonSavedKg" }
        }
      }
    ]),

    // Distinct hosts who offered any trip in range
    Trip.distinct("host", { createdAt: range }),

    // Verified users (campus trust signal)
    User.countDocuments({ verificationStatus: "approved" }),

    // Trips grouped by status (funnel)
    Trip.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),

    // Departure demand by hour of day
    Trip.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: { $hour: "$departureTime" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),

    // New users per day by role
    User.aggregate([
      { $match: { createdAt: range } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            role: "$role"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.day": 1 } }
    ])
  ]);

  // Recommendation funnel (TASK 12): views -> clicks -> joins.
  const [viewAgg, recommendationClicks, recommendationJoins] = await Promise.all([
    MatchEvent.aggregate([
      { $match: { type: "recommendation_view", createdAt: range } },
      { $group: { _id: null, total: { $sum: "$count" } } }
    ]),
    MatchEvent.countDocuments({ type: "recommendation_click", createdAt: range }),
    MatchEvent.countDocuments({ type: "recommendation_join", createdAt: range })
  ]);
  const recommendationViews = viewAgg[0]?.total || 0;
  const matchAcceptanceRate = recommendationClicks
    ? Math.round((recommendationJoins / recommendationClicks) * 100)
    : 0;
  const joinConversionRate = recommendationViews
    ? Math.round((recommendationJoins / recommendationViews) * 100)
    : 0;

  return {
    ridesShared,
    seatsFilled: seatsAndCarbon[0]?.seatsFilled || 0,
    carbonSavedKg: Math.round((seatsAndCarbon[0]?.carbonSavedKg || 0) * 100) / 100,
    activeHosts: activeHosts.length,
    verifiedUsers,
    tripsByStatus,
    tripsByHour,
    userGrowth,
    // Recommendation engine funnel
    recommendationViews,
    recommendationClicks,
    recommendationJoins,
    matchAcceptanceRate,
    joinConversionRate
  };
}

/**
 * Phase 5 — Trust & Safety analytics for the campus operations dashboard.
 * Aggregates SOS activity, user reports, and safe-arrival compliance.
 */
export async function safetyAnalytics({ from, to }) {
  const range = {
    $gte: from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    $lte: to ? new Date(to) : new Date()
  };

  const [
    activeSos,
    sosByStatus,
    totalReports,
    openReports,
    reportsByCategory,
    reportsByStatus,
    completedTrips,
    arrivalsConfirmed
  ] = await Promise.all([
    SosEvent.countDocuments({ status: "active" }),
    SosEvent.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),
    Report.countDocuments({ createdAt: range }),
    Report.countDocuments({ status: { $in: ["open", "reviewing"] } }),
    Report.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]),
    Report.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),
    Trip.countDocuments({ status: "completed", createdAt: range }),
    Trip.countDocuments({
      status: "completed",
      createdAt: range,
      "safety.arrivalConfirmedAt": { $exists: true, $ne: null }
    })
  ]);

  const arrivalConfirmationRate = completedTrips
    ? Math.round((arrivalsConfirmed / completedTrips) * 100)
    : 0;

  return {
    activeSos,
    sosByStatus,
    totalReports,
    openReports,
    reportsByCategory,
    reportsByStatus,
    completedTrips,
    arrivalsConfirmed,
    arrivalConfirmationRate
  };
}
