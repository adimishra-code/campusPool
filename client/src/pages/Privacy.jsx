import PublicLayout from "../components/PublicLayout.jsx";
import { SUPPORT_EMAIL } from "../components/Footer.jsx";

const UPDATED = "June 2026";

export default function Privacy() {
  return (
    <PublicLayout title="Privacy Policy" description="How CampusPool collects, uses and protects your data." seoPath="/privacy">
      <article className="legal">
        <h1>Privacy Policy</h1>
        <p className="muted-text">Last updated: {UPDATED}</p>

        <p>
          CampusPool ("we", "us") helps verified students share rides on campus. This policy explains
          what we collect, why, and the choices you have. We collect the minimum needed to run a safe,
          trustworthy ride-sharing community.
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li><strong>Account data:</strong> name, college email, phone number, hostel/block, and (optionally) student ID.</li>
          <li><strong>Verification data:</strong> documents you upload for identity, student-ID and vehicle verification.</li>
          <li><strong>Trip data:</strong> pickup/drop locations, times, seats, and the people you ride with.</li>
          <li><strong>Payment metadata:</strong> settlement status and method (cash/UPI/wallet). We do <em>not</em> store full card numbers; gateway payments are handled by our processor.</li>
          <li><strong>Safety data:</strong> SOS events, check-ins, emergency contacts, and reports you file or receive.</li>
          <li><strong>Usage data:</strong> with your consent, anonymous analytics about pages visited and actions taken, to improve the product.</li>
        </ul>

        <h2>2. How we use your information</h2>
        <ul>
          <li>To match riders and hosts, and to operate trips end-to-end.</li>
          <li>To verify identity and keep the community safe (trust &amp; safety scores).</li>
          <li>To process ride settlements and resolve payment disputes.</li>
          <li>To send transactional messages (verification codes, trip updates, SOS alerts).</li>
          <li>To improve reliability and features through aggregate analytics (consent-based).</li>
        </ul>

        <h2>3. Cookies &amp; tracking</h2>
        <p>
          We use <strong>essential cookies/storage</strong> to keep you signed in and remember your theme.
          With your consent we use <strong>analytics cookies</strong> to understand usage. You can accept or
          decline analytics in the cookie banner; declining does not affect core functionality.
        </p>

        <h2>4. Third-party services</h2>
        <ul>
          <li><strong>Google Maps</strong> — maps, geocoding and route estimates.</li>
          <li><strong>Razorpay</strong> — optional online payments.</li>
          <li><strong>Twilio</strong> — SMS for safety/SOS alerts.</li>
          <li><strong>Email/SMTP provider</strong> — verification and notification emails.</li>
        </ul>
        <p>These providers process data only to deliver their service to us.</p>

        <h2>5. Data retention &amp; security</h2>
        <p>
          We retain account and trip data while your account is active and as required for safety, legal and
          accounting purposes. Passwords are hashed (bcrypt); reset tokens are stored only as hashes; access is
          restricted and audit-logged.
        </p>

        <h2>6. Your rights</h2>
        <p>
          You can access and update your profile in the app, deactivate your account, and request a copy or
          deletion of your data. Contact us to exercise these rights.
        </p>

        <h2>7. Contact</h2>
        <p>
          Questions about privacy? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </article>
    </PublicLayout>
  );
}
