import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import api from "../services/api.js";
import { fetchMe, setTwoFactor } from "../store/authSlice.js";
import Spinner from "../components/Spinner.jsx";

// Resolve the trust badge from role + verification status.
function trustBadge(user) {
  if (user?.verificationStatus === "approved") {
    return user?.role === "host"
      ? { text: "Verified Host", tone: "ok" }
      : { text: "Verified Student", tone: "ok" };
  }
  if (["pending", "partial"].includes(user?.verificationStatus)) return { text: "Pending Verification", tone: "warn" };
  if (user?.verificationStatus === "rejected") return { text: "Verification Rejected", tone: "bad" };
  return { text: "Unverified", tone: "muted" };
}

export default function Profile() {
  const dispatch = useDispatch();
  const { user, verification } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ name: "", hostel: "", upiId: "" });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "", relationship: "" });
  const [tfaBusy, setTfaBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchMe()).finally(() => setLoaded(true));
  }, [dispatch]);

  useEffect(() => {
    if (user) setForm({ name: user.name || "", hostel: user.hostel || "", upiId: user.upiId || "" });
  }, [user?.name, user?.hostel, user?.upiId]);

  if (!loaded && !user) return <Spinner label="Loading profile…" />;

  const badge = trustBadge(user);
  const isVerified = user?.verificationStatus === "approved";

  const addContact = async (e) => {
    e.preventDefault();
    if (!contact.name.trim() || !contact.phone.trim()) return;
    await api.post("/users/me/emergency-contacts", contact);
    setContact({ name: "", phone: "", relationship: "" });
    dispatch(fetchMe());
  };

  const removeContact = async (id) => {
    await api.delete(`/users/me/emergency-contacts/${id}`);
    dispatch(fetchMe());
  };

  const toggle2fa = async () => {
    setTfaBusy(true);
    try {
      await dispatch(setTwoFactor(!user?.twoFactorEnabled)).unwrap();
      await dispatch(fetchMe());
    } catch { /* no-op */ } finally {
      setTfaBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setSavedMsg(null);
    try {
      await api.patch("/users/me", { name: form.name, hostel: form.hostel, upiId: form.upiId });
      await dispatch(fetchMe());
      setSavedMsg("Profile updated");
    } catch (err) {
      setSavedMsg(err.response?.data?.message || "Could not update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head"><div><p className="eyebrow">Account</p><h1>Profile</h1></div></header>

      <section className="panel">
        <div className="profile-head">
          <span className="avatar xl" aria-hidden>
            {(user?.name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
          </span>
          <div>
            <h2 className="no-margin">{user?.name}</h2>
            <small className="role-line">
              {user?.role === "host" ? "Host" : "Student"}
              <span className={`vbadge ${badge.tone}`}>{badge.text}</span>
            </small>
          </div>
        </div>

        <div className="detail-grid">
          <div><small>Email</small><strong>{user?.email}</strong></div>
          <div><small>Phone</small><strong>{user?.phone || "—"}</strong></div>
          <div><small>Student ID</small><strong>{user?.studentId || "—"}</strong></div>
          <div><small>Trust score</small><strong>{user?.trustScore ?? "—"}</strong></div>
          <div><small>Safety score</small><strong>{user?.safetyScore ?? "—"}</strong></div>
          {verification && <div><small>Verification</small><strong>{verification.progress ?? 0}% complete</strong></div>}
        </div>
        {!isVerified && (
          <div className="verify-cta">
            <span>Get your trust badge — verify your email and student ID.</span>
            <Link className="primary" to="/verify">Verify now</Link>
          </div>
        )}
      </section>

      <section className="panel">
        <p className="eyebrow">Edit details</p>
        <form className="form-grid" onSubmit={save}>
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Hostel</span>
            <input value={form.hostel} onChange={(e) => setForm({ ...form, hostel: e.target.value })} placeholder="Block A" />
          </label>
          <label className="field">
            <span>UPI ID</span>
            <input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="name@bank" />
            <small className="muted-text">Lets passengers pay you directly by QR when you host.</small>
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
        {savedMsg && <div className="alert info">{savedMsg}</div>}
      </section>

      <section className="panel">
        <p className="eyebrow">Security</p>
        <div className="security-row">
          <div>
            <strong>Two-factor login {user?.twoFactorEnabled ? "(on)" : "(off)"}</strong>
            <small className="muted-text">
              {user?.twoFactorEnabled
                ? "We email a one-time code each time you log in."
                : "Add a one-time email code at login for extra protection."}
            </small>
          </div>
          <button
            className={user?.twoFactorEnabled ? "secondary" : "primary"}
            onClick={toggle2fa}
            disabled={tfaBusy}
          >
            {tfaBusy ? "Saving…" : user?.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
          </button>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Emergency contacts</p>
        <p className="muted-text">These people are alerted if you raise an SOS during a trip.</p>
        <div className="list">
          {(user?.emergencyContacts || []).map((c) => (
            <article key={c._id} className="queue-row">
              <div>
                <strong>{c.name}</strong>
                <small>{c.phone}{c.relationship ? ` · ${c.relationship}` : ""}</small>
              </div>
              <button className="secondary sm" onClick={() => removeContact(c._id)}>Remove</button>
            </article>
          ))}
          {(user?.emergencyContacts || []).length === 0 && <small className="muted-text">No contacts yet.</small>}
        </div>
        <form className="form-grid" onSubmit={addContact} style={{ marginTop: 12 }}>
          <input placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} required />
          <input placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} required />
          <input placeholder="Relationship (optional)" value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} />
          <button className="primary" type="submit">Add contact</button>
        </form>
      </section>
    </div>
  );
}
