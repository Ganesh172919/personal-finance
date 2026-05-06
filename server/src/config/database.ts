/**
 * @fileoverview Database Configuration Module
 *
 * This module handles MongoDB database connection management for the Personal Finance application.
 * It provides functions to connect to MongoDB (either production URI or in-memory for development)
 * and manage connection lifecycle events.
 *
 * KEY FEATURES:
 * - Automatic fallback to in-memory MongoDB for development/testing
 * - Connection event logging (connected, error, disconnected)
 * - Connection pooling with configurable max pool size
 * - Strict connection mode for production environments
 *
 * @module config/database
 */

import mongoose from "mongoose"; // MongoDB ODM (Object Document Modeling) library
import type { MongoMemoryServer } from "mongodb-memory-server"; // In-memory MongoDB for testing
import { getEnv } from "./env"; // Environment configuration
import { logger } from "./logger"; // Application logger

// Flag to track if connection event listeners have been bound
let listenersBound = false;
// In-memory MongoDB server instance (for development/testing)
let memoryServer: MongoMemoryServer | null = null;

/**
 * Binds event listeners to the Mongoose connection.
 *
 * This function sets up listeners for connection events:
 * - connected: Fired when successfully connected to MongoDB
 * - error: Fired when a connection error occurs
 * - disconnected: Fired when disconnected from MongoDB
 *
 * The function uses a flag to ensure listeners are only bound once.
 */
const bindConnectionListeners = () => {
  // Prevent binding listeners multiple times
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  // Log successful connection
  mongoose.connection.on("connected", () => {
    logger.info("Mongoose connected to the database.");
  });

  // Log connection errors
  mongoose.connection.on("error", (error) => {
    logger.error({ error }, "Mongoose connection error");
  });

  // Log disconnection events
  mongoose.connection.on("disconnected", () => {
    logger.info("Mongoose disconnected from the database.");
  });
};

/**
 * Connects to MongoDB database.
 *
 * This function establishes a connection to MongoDB with the following behavior:
 * - In production: Requires MONGO_URI environment variable
 * - In development/test: Falls back to in-memory MongoDB if MONGO_URI is not set or connection fails
 *
 * Connection options:
 * - serverSelectionTimeoutMS: 10 seconds timeout for server selection
 * - maxPoolSize: Maximum of 20 concurrent connections in the pool
 *
 * @returns {Promise<void>} Resolves when connection is established
 * @throws {Error} If MONGO_URI is missing in production or connection fails
 */
export const connectDB = async () => {
  const env = getEnv();
  // Bind connection event listeners (only once)
  bindConnectionListeners();

  /**
   * Connects to MongoDB using the provided URI.
   *
   * @param {string} uri - MongoDB connection string
   */
  const connectWithUri = async (uri: string) => {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000, // 10 seconds timeout for server selection
      maxPoolSize: 20, // Maximum 20 concurrent connections
    });
  };

  /**
   * Falls back to in-memory MongoDB for development/testing.
   *
   * This function dynamically imports mongodb-memory-server and creates
   * an in-memory MongoDB instance for local development.
   *
   * @param {string} reason - Reason for falling back to in-memory MongoDB
   */
  const connectWithInMemory = async (reason: string) => {
    logger.warn(`${reason} Falling back to in-memory MongoDB.`);

    // Dynamically import mongodb-memory-server (only needed for dev/test)
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: "finwise-local", // Database name for in-memory instance
        launchTimeout: 30_000, // 30 seconds timeout to start
      },
    });

    const memoryUri = memoryServer.getUri();
    await connectWithUri(memoryUri);

    logger.warn(`Using in-memory MongoDB at ${memoryUri}`);
  };

  // Check if MONGO_URI is configured
  if (!env.MONGO_URI) {
    // In production, MONGO_URI is required
    if (env.NODE_ENV === "production") {
      throw new Error("MONGO_URI is not defined in the environment configuration.");
    }

    // In development/test, fall back to in-memory MongoDB
    await connectWithInMemory("MONGO_URI is not configured in non-production mode.");
    return;
  }

  try {
    // Try to connect using the configured MONGO_URI
    await connectWithUri(env.MONGO_URI);
  } catch (error) {
    // In production, throw the error
    if (env.NODE_ENV === "production") {
      throw error;
    }
    // In development/test, fall back to in-memory MongoDB
    await connectWithInMemory("Primary MongoDB connection failed in non-production mode.");
  }
};

/**
 * Connects to MongoDB in strict mode (production-only).
 *
 * This function requires MONGO_URI to be configured and does not fall back
 * to in-memory MongoDB. Use this for production connections where in-memory
 * MongoDB is not acceptable.
 *
 * @returns {Promise<void>} Resolves when connection is established
 * @throws {Error} If MONGO_URI is not configured
 */
export const connectDBStrict = async () => {
  const env = getEnv();
  // Bind connection event listeners (only once)
  bindConnectionListeners();

  // MONGO_URI is required for strict connections
  if (!env.MONGO_URI) {
    throw new Error("MONGO_URI is required for strict database connections.");
  }

  // Connect to MongoDB with strict settings
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000, // 10 seconds timeout for server selection
    maxPoolSize: 20, // Maximum 20 concurrent connections
  });
};

/**
 * Closes the MongoDB connection and stops in-memory server if running.
 *
 * This function should be called when the application is shutting down
 * to properly clean up database connections and resources.
 *
 * @returns {Promise<void>} Resolves when connection is closed
 */
export const closeDB = async () => {
  // Disconnect from MongoDB
  await mongoose.disconnect();

  // Stop in-memory MongoDB server if it was started
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Graceful Fallback**: The connectDB() function tries the configured MONGO_URI
 *    first, then falls back to in-memory MongoDB for development. This means
 *    developers can run the app without a local MongoDB installation.
 *
 * 2. **Connection Pooling**: maxPoolSize: 20 means Mongoose maintains up to 20
 *    concurrent connections to MongoDB. This is important for performance under
 *    concurrent load. Tune this based on your MongoDB server capacity.
 *
 * 3. **Event Listeners**: Connection events (connected, error, disconnected) are
 *    logged for observability. The `listenersBound` flag prevents duplicate listeners
 *    if connectDB() is called multiple times.
 *
 * 4. **Dynamic Import**: mongodb-memory-server is dynamically imported only when
 *    needed. This avoids pulling in a large dependency in production.
 *
 * 5. **Strict vs Flexible**: connectDBStrict() is for production use where in-memory
 *    fallback is not acceptable. connectDB() is the flexible version for development.
 *
 * PATTERNS TO LEARN:
 * ─────────────────
 * - Idempotent initialization (listenersBound flag)
 * - Dynamic imports for optional dependencies
 * - Graceful fallback for development experience
 * - Connection pool sizing for production
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * database.ts → called by server.ts during startup
 * database.ts → all Mongoose models depend on the connection established here
 * database.ts → closeDB() called by server.ts during graceful shutdown
 * ══════════════════════════════════════════════════════════════════════
 */
