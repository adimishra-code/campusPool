import mongoose from "mongoose";

const collegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Email domains that belong to this college, e.g. ["univ.edu", "students.univ.edu"]
    domains: { type: [String], default: [], index: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true }
  },
  { timestamps: true }
);

// Store domains lowercased for reliable matching.
collegeSchema.pre("save", function (next) {
  if (this.isModified("domains")) {
    this.domains = (this.domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  }
  next();
});

// Find the active college that owns the domain of an email address.
collegeSchema.statics.matchEmail = function (email) {
  const domain = String(email || "")
    .split("@")[1]
    ?.toLowerCase();
  if (!domain) return null;
  return this.findOne({ status: "active", domains: domain });
};

// Seed a couple of demo colleges so the campus flow works out of the box.
collegeSchema.statics.initializeDefaults = async function () {
  const count = await this.countDocuments();
  if (count > 0) return;
  await this.create([
    { name: "Gautam Buddha University", domains: ["gbu.ac.in", "gmail.com", "univ.edu"], status: "active" },
    { name: "Campus Institute of Technology", domains: ["cit.edu"], status: "active" }
  ]);
};

export default mongoose.model("College", collegeSchema);
