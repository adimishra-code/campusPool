import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import College from "../models/College.js";
import AuditLog from "../models/AuditLog.js";
import { env } from "../config/env.js";

let configured = false;

// Wire the Google strategy only when credentials are present. Returns whether
// OAuth is active so callers can mount routes conditionally. Safe to call once
// at startup; idempotent.
export function configureOAuth() {
  if (configured || !env.googleOAuthConfigured) return configured;

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const emailEntry = profile.emails?.[0];
          const email = emailEntry?.value?.toLowerCase();
          // Google flags each email as verified true/false. Only trust an email we
          // can prove Google has verified.
          const emailVerified = emailEntry?.verified === true || emailEntry?.verified === "true";
          const googleId = profile.id;

          // Always match an existing account by googleId; match by email ONLY when
          // Google has verified that email. Otherwise an attacker controlling an
          // unverified Google email equal to a victim's could link/take over the
          // victim's account.
          let user = await User.findOne({
            $or: [{ googleId }, ...(email && emailVerified ? [{ email }] : [])]
          });

          if (user) {
            if (!user.googleId) user.googleId = googleId;
            // A *verified* Google email satisfies the hard email gate.
            if (emailVerified && !user.emailVerified) user.emailVerified = true;
            await user.save();
          } else {
            // No account to link — refuse to provision one from an unverified email.
            if (email && !emailVerified) {
              return done(null, false, { message: "Your Google email is not verified." });
            }
            await College.initializeDefaults();
            const college = email ? await College.matchEmail(email) : null;
            user = await User.create({
              name: profile.displayName || email?.split("@")[0] || "Student",
              email,
              // Placeholder phone — OAuth users complete this in their profile.
              phone: `g_${googleId}`.slice(0, 15),
              googleId,
              role: "student",
              college: college?._id,
              collegeEmail: email,
              emailVerified: true,
              verificationStatus: "unverified"
            });
            await AuditLog.log("user.register", "User", user._id, user._id, { provider: "google" });
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  configured = true;
  return configured;
}

export { passport };
