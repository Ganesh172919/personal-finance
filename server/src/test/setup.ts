import mongoose from "mongoose";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.CSRF_ENABLED = process.env.CSRF_ENABLED || "true";
process.env.MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED || "true";

// Models are loaded before the in-memory MongoDB starts. Keep buffering so
// Mongoose can initialize collections and indexes after the connection opens.
mongoose.set("bufferTimeoutMS", 30_000);
