import { useEffect, useState, useCallback } from "react";
import api from "../services/api.js";
import { trackEvent } from "../services/tracking.js";

// Peer-to-peer trip settlement. A passenger pays the host their share directly
// — by scanning the host's UPI QR (online) or handing over cash — and records
// it here. The host sees who has settled.
export default function TripPayment({ tripId, isHost }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/trips/${tripId}/payment`)
      .then(({ data }) => setInfo(data))
      .catch(() => {});
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!info) return null;

  const settle = async (method) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/trips/${tripId}/settle`, { method });
      trackEvent("payment_settle", { tripId, method });
      setMsg(method === "cash" ? "Cash payment recorded ✓" : "UPI payment recorded ✓");
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Could not record payment");
    } finally {
      setBusy(false);
    }
  };

  const settled = info.mySettlement?.settled;

  return (
    <section className="panel payment-panel">
      <p className="eyebrow">Payment</p>
      <div className="detail-grid">
        <div>
          <small>Your share</small>
          <strong>₹{info.amount}</strong>
        </div>
        <div>
          <small>Trip payment</small>
          <strong style={{ textTransform: "capitalize" }}>{info.paymentStatus}</strong>
        </div>
      </div>

      {/* Passenger view: settle your share with the host. */}
      {!isHost &&
        (settled ? (
          <div className="alert info">Your share is settled ({info.mySettlement.method}).</div>
        ) : (
          <>
            {info.upi ? (
              <div className="upi-pay">
                <img
                  className="upi-qr"
                  src={info.upi.qr}
                  alt={`UPI QR for ${info.host?.name}`}
                  width={180}
                  height={180}
                />
                <div>
                  <p className="muted-text">
                    Scan to pay <strong>{info.host?.name}</strong> directly
                  </p>
                  <small className="muted-text">{info.upi.vpa}</small>
                  <div className="button-row" style={{ marginTop: 8 }}>
                    <a className="primary" href={info.upi.intent}>
                      Open UPI app
                    </a>
                    <button className="secondary" disabled={busy} onClick={() => settle("upi")}>
                      I&apos;ve paid by UPI
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted-text">
                The host hasn&apos;t added a UPI ID. Pay in cash and mark it below.
              </p>
            )}
            <div className="button-row">
              <button className="secondary" disabled={busy} onClick={() => settle("cash")}>
                Paid in cash
              </button>
            </div>
          </>
        ))}

      {/* Host view: who has settled. */}
      {isHost && (
        <div className="list">
          {(info.split || []).length === 0 && (
            <small className="muted-text">No passenger settlements yet.</small>
          )}
          {(info.split || []).map((s) => (
            <article key={String(s.user)} className="queue-row">
              <div>
                <small>Passenger share</small>
                <strong>₹{s.amount}</strong>
              </div>
              <span className={`vbadge ${s.settled ? "ok" : "muted"}`}>
                {s.settled ? `Paid · ${s.method}` : "Unpaid"}
              </span>
            </article>
          ))}
          {!info.host?.hasUpi && (
            <div className="alert info">
              Add your UPI ID in your profile so passengers can pay you online.
            </div>
          )}
        </div>
      )}

      {msg && <div className="alert info">{msg}</div>}
    </section>
  );
}
