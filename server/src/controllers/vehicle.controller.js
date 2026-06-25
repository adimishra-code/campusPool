import { body, param } from "express-validator";
import Vehicle from "../models/Vehicle.js";
import Verification from "../models/Verification.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const vehicleRules = [
  body("make").trim().notEmpty().isLength({ max: 50 }),
  body("model").trim().notEmpty().isLength({ max: 50 }),
  body("color").trim().notEmpty(),
  body("year")
    .optional()
    .isInt({ min: 2000, max: new Date().getFullYear() + 1 }),
  body("plateNumber").trim().notEmpty().toUpperCase(),
  body("seats").optional().isInt({ min: 2, max: 8 }),
  body("category").optional().isIn(["bike", "auto", "car", "suv"]),
  body("amenities").optional().isObject()
];

export const vehicleIdRule = [param("id").isMongoId()];

// Get all vehicles for current user
export const getMyVehicles = asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.find({ owner: req.user._id }).sort("-createdAt");

  res.json({
    vehicles
  });
});

// Get single vehicle
export const getVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    owner: req.user._id
  });

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({ vehicle });
});

// Register new vehicle
export const registerVehicle = asyncHandler(async (req, res) => {
  const { make, model, color, year, plateNumber, seats, category, amenities } = req.body;

  // Check if plate number already exists
  const existing = await Vehicle.findOne({ plateNumber: plateNumber.toUpperCase() });
  if (existing) {
    const error = new Error("Vehicle with this plate number already registered");
    error.statusCode = 400;
    throw error;
  }

  const vehicle = await Vehicle.create({
    owner: req.user._id,
    make,
    model,
    color,
    year,
    plateNumber: plateNumber.toUpperCase(),
    seats: seats || 4,
    category: category || "car",
    amenities,
    verificationStatus: "unverified"
  });

  // Log the action
  await AuditLog.log("vehicle.register", "Vehicle", vehicle._id, req.user._id, {
    make,
    model,
    plateNumber
  });

  // Create or update verification record with vehicle info, and enqueue the
  // vehicle for admin review immediately so it appears in the Pending Vehicles
  // queue right after registration. Documents can be attached now or uploaded
  // later via /verify (uploadVehicleDocument) / POST /vehicles/:id/documents.
  let verification = await Verification.findOne({ user: req.user._id });
  if (!verification) {
    verification = new Verification({ user: req.user._id });
  }

  const documents = req.body.documents
    ? [
        { type: "rc", url: req.body.documents.rc, status: "pending" },
        { type: "insurance", url: req.body.documents.insurance, status: "pending" },
        { type: "pollution", url: req.body.documents.pollution, status: "pending" }
      ]
    : verification.vehicleVerification?.documents || [];

  verification.vehicleVerification = {
    vehicle: vehicle._id,
    documents,
    overallStatus: "pending"
  };
  vehicle.verificationStatus = "pending";
  await vehicle.save();
  await verification.save();

  res.status(201).json({
    message: "Vehicle registered successfully",
    vehicle,
    requiresVerification: !vehicle.verificationStatus === "approved"
  });
});

// Update vehicle
export const updateVehicle = asyncHandler(async (req, res) => {
  const allowedFields = [
    "make",
    "model",
    "color",
    "year",
    "seats",
    "category",
    "amenities",
    "isActive"
  ];
  const updates = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  await AuditLog.log("vehicle.update", "Vehicle", vehicle._id, req.user._id, {
    updatedFields: Object.keys(updates)
  });

  res.json({
    message: "Vehicle updated",
    vehicle
  });
});

// Submit vehicle documents for verification
export const submitVehicleDocuments = asyncHandler(async (req, res) => {
  const { rc, insurance, pollution, permit } = req.body;

  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    owner: req.user._id
  });

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  // Update documents
  vehicle.documents = {
    rc: rc || vehicle.documents?.rc,
    insurance: insurance || vehicle.documents?.insurance,
    pollution: pollution || vehicle.documents?.pollution,
    permit: permit || vehicle.documents?.permit
  };
  vehicle.verificationStatus = "pending";

  await vehicle.save();

  // Update verification record
  const verification = await Verification.findOne({ user: req.user._id });
  if (verification) {
    verification.vehicleVerification = {
      vehicle: vehicle._id,
      documents: [
        { type: "rc", url: vehicle.documents.rc, status: "pending" },
        { type: "insurance", url: vehicle.documents.insurance, status: "pending" },
        { type: "pollution", url: vehicle.documents.pollution, status: "pending" }
      ],
      overallStatus: "pending"
    };
    await verification.save();
  }

  await AuditLog.log("verification.submit", "Vehicle", vehicle._id, req.user._id, {
    type: "vehicle"
  });

  res.json({
    message: "Documents submitted for verification",
    vehicle: {
      id: vehicle._id,
      verificationStatus: vehicle.verificationStatus,
      documents: {
        rc: !!vehicle.documents.rc,
        insurance: !!vehicle.documents.insurance,
        pollution: !!vehicle.documents.pollution
      }
    }
  });
});

// Delete vehicle
export const deleteVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id
  });

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  await AuditLog.log("vehicle.delete", "Vehicle", vehicle._id, req.user._id, {
    make: vehicle.make,
    model: vehicle.model
  });

  res.json({ message: "Vehicle deleted successfully" });
});

// Update vehicle location (for active trips)
export const updateVehicleLocation = asyncHandler(async (req, res) => {
  const { coordinates } = req.body;

  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    {
      $set: {
        "currentLocation.coordinates": coordinates,
        "currentLocation.updatedAt": new Date()
      }
    },
    { new: true }
  );

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    message: "Location updated",
    location: vehicle.currentLocation
  });
});

// ADMIN: Get all vehicles
export const getAllVehicles = asyncHandler(async (req, res) => {
  const { verificationStatus, category, page = 1, limit = 20 } = req.query;

  const query = {};
  if (verificationStatus) query.verificationStatus = verificationStatus;
  if (category) query.category = category;

  const vehicles = await Vehicle.find(query)
    .populate("owner", "name email phone hostel")
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Vehicle.countDocuments(query);

  res.json({
    vehicles,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit)
  });
});

// ADMIN: Approve vehicle
export const approveVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        verificationStatus: "approved"
      }
    },
    { new: true }
  ).populate("owner", "name email");

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  // Update user role to host if not already
  // (This would typically require vehicle verification first)

  await AuditLog.log("verification.approve", "Vehicle", vehicle._id, req.user._id, {
    type: "vehicle",
    owner: vehicle.owner._id
  });

  res.json({
    message: "Vehicle approved",
    vehicle
  });
});

// ADMIN: Reject vehicle
export const rejectVehicle = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const vehicle = await Vehicle.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        verificationStatus: "rejected"
      }
    },
    { new: true }
  ).populate("owner", "name email");

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  await AuditLog.log("verification.reject", "Vehicle", vehicle._id, req.user._id, { reason });

  res.json({
    message: "Vehicle rejected",
    vehicle
  });
});
