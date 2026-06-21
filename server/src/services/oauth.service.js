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

  passport.use(new GoogleStrategy(
    {
      clientID: env.googleClientId,
      clientSecret: env.googleClientSecret,
      callbackURL: env.googleCallbackUrl
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const googleId = profile.id;

        // Prefer an existing link by googleId, else match/claim by email.
        let user = await User.findOne({ $or: [{ googleId }, ...(email ? [{ email }] : [])] });

        if (user) {
          if (!user.googleId) user.googleId = googleId;
          // A Google-verified email satisfies the hard email gate.
          if (!user.emailVerified) user.emailVerified = true;
          await user.save();
        } else {
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
  ));

  configured = true;
  return configured;
}

export { passport };
