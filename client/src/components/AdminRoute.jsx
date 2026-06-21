import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";

// Client-side guard for /admin/* routes. This is a UX convenience only — every
// admin API endpoint is independently enforced server-side with
// authorize("admin"), so this guard cannot be the security boundary. It simply
// keeps non-admins from landing on a panel they can't use.
export default function AdminRoute() {
  const user = useSelector((state) => state.auth.user);
  return user?.role === "admin" ? <Outlet /> : <Navigate to="/feed" replace />;
}
