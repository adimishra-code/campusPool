import PublicLayout from "../components/PublicLayout.jsx";
import { SUPPORT_EMAIL } from "../components/Footer.jsx";

const UPDATED = "June 2026";

export default function Terms() {
  return (
    <PublicLayout title="Terms & Conditions" description="The terms that govern your use of CampusPool." seoPath="/terms">
      <article className="legal">
        <h1>Terms &amp; Conditions</h1>
        <p className="muted-text">Last updated: {UPDATED}</p>

        <p>
          By creating an account or using CampusPool you agree to these terms. CampusPool is a platform that
          connects verified students to share rides; we are not a transportation carrier and do not provide
          transportation services ourselves.
        </p>

        <h2>1. Eligibility &amp; accounts</h2>
        <ul>
          <li>You must be a student (or affiliated member) with a valid college email and be able to form a binding agreement.</li>
          <li>You must verify your email and complete identity/student-ID verification before offering or joining rides.</li>
          <li>You are responsible for your account, your password, and all activity under it. Keep your credentials secure.</li>
        </ul>

        <h2>2. Acceptable use</h2>
        <ul>
          <li>Provide accurate information and treat other members with respect.</li>
          <li>No harassment, unsafe driving, discrimination, fraud, or illegal activity.</li>
          <li>Hosts must hold valid licenses/registration and follow all traffic laws.</li>
          <li>Don't attempt to bypass verification, scrape data, or disrupt the service.</li>
        </ul>

        <h2>3. Rides &amp; payments</h2>
        <p>
          Ride costs are arranged between hosts and riders (cost-sharing, not for profit). Settlement happens
          directly (cash/UPI) or via the in-app wallet/gateway. CampusPool is not party to the payment and is
          not responsible for disputes, though we provide tools and support to help resolve them.
        </p>

        <h2>4. Safety</h2>
        <p>
          Safety features (SOS, check-ins, trip sharing, reporting) are provided to assist you but are not a
          substitute for emergency services. In an emergency, contact local authorities first.
        </p>

        <h2>5. Content &amp; conduct</h2>
        <p>
          You retain ownership of content you submit but grant us a license to use it to operate the service.
          We may suspend or remove accounts that violate these terms or endanger the community.
        </p>

        <h2>6. Disclaimers &amp; liability</h2>
        <p>
          The service is provided "as is" without warranties. To the maximum extent permitted by law,
          CampusPool is not liable for indirect or consequential damages arising from rides arranged through
          the platform or interactions between members.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may update these terms; material changes will be notified in-app or by email. Continued use after
          changes means you accept the revised terms.
        </p>

        <h2>8. Contact</h2>
        <p>
          Questions about these terms? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </article>
    </PublicLayout>
  );
}
