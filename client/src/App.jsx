import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import Login from "./pages/Login.jsx";
import SharedTrip from "./pages/SharedTrip.jsx";
import FindTrips from "./pages/FindTrips.jsx";
import OfferTrip from "./pages/OfferTrip.jsx";
import MyTrips from "./pages/MyTrips.jsx";
import TripDetail from "./pages/TripDetail.jsx";
import Profile from "./pages/Profile.jsx";
import Verification from "./pages/Verification.jsx";
import AdminVerifications from "./pages/AdminVerifications.jsx";
import AdminSafety from "./pages/AdminSafety.jsx";
import Recommendations from "./pages/Recommendations.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import Support from "./pages/Support.jsx";
import ReportBug from "./pages/ReportBug.jsx";
import { trackPageView } from "./services/tracking.js";
import { fetchMe } from "./store/authSlice.js";

// Fire a (consent-gated) page-view on every route change.
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  const dispatch = useDispatch();

  // Bootstrap auth on load: validate the httpOnly session cookie via /auth/me.
  // Sets `bootstrapped` so ProtectedRoute knows whether a session exists. This
  // is the only way the SPA can learn about the cookie (it cannot read it).
  useEffect(() => {
    dispatch(fetchMe());
  }, [dispatch]);

  return (
    <>
      <RouteTracker />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        {/* Password-reset deep link from email — Login reads ?email=&token=. */}
        <Route path="/reset-password" element={<Login />} />
        <Route path="/share/:token" element={<SharedTrip />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/support" element={<Support />} />
        <Route path="/help" element={<Support />} />
        <Route path="/report-bug" element={<ReportBug />} />

        {/* Authenticated app */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<FindTrips />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/offer" element={<OfferTrip />} />
            <Route path="/my-trips" element={<MyTrips />} />
            <Route path="/trip/:id" element={<TripDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/verify" element={<Verification />} />
            {/* Admin-only (UX guard; server enforces authorize("admin")). */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/verifications" element={<AdminVerifications />} />
              <Route path="/admin/safety" element={<AdminSafety />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </>
  );
}
