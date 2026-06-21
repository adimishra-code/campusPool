import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import Spinner from "./Spinner.jsx";

export default function ProtectedRoute() {
  const { authenticated, bootstrapped } = useSelector((state) => state.auth);

  // While the initial session check is in flight, don't bounce a (possibly)
  // valid cookie session to /login — show a brief loading state instead.
  if (!bootstrapped) {
    return (
      <div className="page page-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  return authenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
