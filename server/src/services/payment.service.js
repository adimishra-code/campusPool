import QRCode from "qrcode";

/**
 * Build a UPI payment intent string for paying a host directly (peer-to-peer).
 * Scanning/opening it launches the payer's UPI app pre-filled with the host's
 * VPA and the amount — the convenient "pay the person via QR" campus flow.
 */
export function buildUpiIntent({ vpa, payeeName, amount, note }) {
  // The VPA (pa) is kept literal — UPI apps expect the `@` unencoded — while
  // free-text fields (payee name, note) are URI-encoded.
  const parts = [
    `pa=${vpa}`,
    `pn=${encodeURIComponent(payeeName || "Trip host")}`,
    `am=${amount}`,
    "cu=INR"
  ];
  if (note) parts.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${parts.join("&")}`;
}

// Render a UPI intent as a QR data-URL the client can drop straight into <img>.
export async function buildUpiQr(intent) {
  return QRCode.toDataURL(intent, { margin: 1, width: 240 });
}
