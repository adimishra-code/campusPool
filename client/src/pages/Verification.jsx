import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import api from "../services/api.js";
import { fetchMe } from "../store/authSlice.js";
import Spinner from "../components/Spinner.jsx";

function Step({ label, done }) {
  return (
    <div className={`vstep ${done ? "done" : ""}`}>
      <span className="vstep-dot">{done ? "✓" : ""}</span>
      <span>{label}</span>
    </div>
  );
}

export default function Verification() {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const isHost = user?.role === "host";

  const [v, setV] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  // email step
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [previewOtp, setPreviewOtp] = useState(null);

  // vehicle step
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState("");

  const refresh = async () => {
    const { data } = await api.get("/verification/status");
    setV(data.verification);
  };

  useEffect(() => {
    (async () => {
      try {
        await refresh();
        if (isHost) {
          const { data } = await api.get("/vehicles");
          setVehicles(data.vehicles || []);
          if (data.vehicles?.[0]) setVehicleId(data.vehicles[0]._id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isHost]);

  const flash = (m) => { setMsg(m); setErr(null); };
  const fail = (e) => { setErr(e.response?.data?.message || "Something went wrong"); setMsg(null); };

  const sendOtp = async () => {
    try {
      const { data } = await api.post("/verification/college-email/otp", {});
      setOtpSent(true);
      setPreviewOtp(data.previewOtp || null);
      flash(data.message);
    } catch (e) { fail(e); }
  };

  const verifyOtp = async () => {
    try {
      await api.post("/verification/college-email/verify", { otp });
      flash("Email verified ✓");
      await refresh();
      dispatch(fetchMe());
    } catch (e) { fail(e); }
  };

  const uploadDoc = async (endpoint, file, extra = {}) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("document", file);
    Object.entries(extra).forEach(([k, val]) => fd.append(k, val));
    try {
      const { data } = await api.post(endpoint, fd);
      flash(data.message);
      await refresh();
      dispatch(fetchMe());
    } catch (e) { fail(e); }
  };

  if (loading) return <Spinner label="Loading verification…" />;

  const emailDone = v?.collegeEmail?.verified;
  const studentDone = v?.studentId?.status === "approved" && v?.identityProof?.status === "approved";
  const vehicleDone = v?.vehicleVerification?.overallStatus === "approved";

  const statusTag = (s) => <span className={`pill ${s === "approved" ? "ok" : s === "rejected" ? "bad" : s ? "warn" : "muted"}`}>{s || "not submitted"}</span>;

  return (
    <div className="page">
      <header className="page-head">
        <div><p className="eyebrow">Trust & safety</p><h1>Get verified</h1></div>
        <span className="pill info">{v?.progress ?? 0}% complete</span>
      </header>

      <div className="vtracker">
        <Step label="Email" done={emailDone} />
        <Step label="Student ID" done={studentDone} />
        {isHost && <Step label="Vehicle" done={vehicleDone} />}
      </div>

      {msg && <div className="alert info">{msg}</div>}
      {err && <div className="alert error">{err}</div>}

      {/* Email verification */}
      <section className="panel">
        <div className="section-head"><p className="eyebrow">Email verification</p>{statusTag(emailDone ? "approved" : "pending")}</div>
        <p className="muted-text">Verify your college email ({v?.collegeEmail?.email || user?.email}).</p>
        {emailDone ? (
          <div className="alert info">Your college email is verified.</div>
        ) : (
          <div className="inline-form">
            <button className="secondary" onClick={sendOtp}>{otpSent ? "Resend code" : "Send code"}</button>
            {otpSent && (
              <>
                <input placeholder="Enter 6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
                <button className="primary" onClick={verifyOtp}>Verify</button>
              </>
            )}
            {previewOtp && <span className="dev-hint">Dev code: <strong>{previewOtp}</strong></span>}
          </div>
        )}
      </section>

      {/* Student verification */}
      <section className="panel">
        <div className="section-head"><p className="eyebrow">Student verification</p></div>
        <div className="upload-grid">
          <div className="upload-card">
            <strong>Student ID card</strong>
            {statusTag(v?.studentId?.status)}
            {v?.studentId?.rejectionReason && <small className="field-error">{v.studentId.rejectionReason}</small>}
            <input type="file" accept="image/*,application/pdf" onChange={(e) => uploadDoc("/verification/upload/student-id", e.target.files[0])} />
          </div>
          <div className="upload-card">
            <strong>College ID</strong>
            {statusTag(v?.identityProof?.status)}
            {v?.identityProof?.rejectionReason && <small className="field-error">{v.identityProof.rejectionReason}</small>}
            <input type="file" accept="image/*,application/pdf" onChange={(e) => uploadDoc("/verification/upload/college-id", e.target.files[0], { type: "college_id" })} />
          </div>
        </div>
      </section>

      {/* Vehicle verification (hosts) */}
      {isHost && (
        <section className="panel">
          <div className="section-head"><p className="eyebrow">Vehicle verification</p>{statusTag(v?.vehicleVerification?.overallStatus)}</div>
          {vehicles.length === 0 ? (
            <p className="muted-text">Add a vehicle from the Offer Trip page first, then upload its documents here.</p>
          ) : (
            <>
              <label className="field" style={{ maxWidth: 320 }}>
                <span>Vehicle</span>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  {vehicles.map((veh) => <option key={veh._id} value={veh._id}>{veh.make} {veh.model} · {veh.plateNumber}</option>)}
                </select>
              </label>
              <div className="upload-grid">
                {["license", "rc", "photo"].map((t) => (
                  <div className="upload-card" key={t}>
                    <strong>{t === "rc" ? "RC" : t === "license" ? "Driving license" : "Vehicle photo"}</strong>
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => uploadDoc("/verification/upload/vehicle", e.target.files[0], { vehicleId, type: t })} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
