import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import api from "../services/api.js";
import EmptyState from "../components/EmptyState.jsx";
import { fetchMe } from "../store/authSlice.js";

export default function TeamAccess() {
  const dispatch = useDispatch();
  const { user: currentUser } = useSelector((s) => s.auth);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  if (currentUser?.role !== "admin") {
    return (
      <EmptyState
        icon="Admin"
        title="Admins only"
        hint="This panel is restricted to administrators."
      />
    );
  }

  const handlePromote = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const { data } = await api.post("/admin/promote", { email: email.trim() });
      setMessage(data.message);
      setEmail("");
      dispatch(fetchMe());
    } catch (err) {
      setError(err.response?.data?.message || "Failed to promote user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <p className="eyebrow">Team Access</p>
      <p className="muted-text" style={{ marginBottom: "var(--space-md)" }}>
        Grant admin privileges to an existing user by their email address.
      </p>

      <form onSubmit={handlePromote} className="form-row" style={{ gap: "var(--space-sm)" }}>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ flex: 1 }}
          disabled={loading}
        />
        <button type="submit" className="primary" disabled={loading || !email.trim()}>
          {loading ? "Promoting..." : "Promote to Admin"}
        </button>
      </form>

      {message && <div className="alert info">{message}</div>}
      {error && <div className="alert error">{error}</div>}
    </section>
  );
}
