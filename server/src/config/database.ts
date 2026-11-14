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
import { runStartupMigrations } from "../services/dbMigrations"; // Idempotent post-connect index migrations

// Flag to track if connection event listeners have been bound
/**
 * Connection-pool tuning, env-driven so each deployment can size the pool for its
 * replica count (total connections = replicas x MONGO_MAX_POOL_SIZE; Atlas/DocumentDB
 * cap connections per cluster tier).
 *   MONGO_MAX_POOL_SIZE            default 20
 *   MONGO_MIN_POOL_SIZE            default 0 (keep warm connections: set e.g. 5 in prod)
 *   MONGO_SOCKET_TIMEOUT_MS        default 45000 (0 = no socket timeout)
 *   MONGO_WAIT_QUEUE_TIMEOUT_MS    default 10000 (fail fast instead of queueing forever
 *                                  when the pool is exhausted; 0 = wait indefinitely)
 *   MONGO_SERVER_SELECTION_TIMEOUT_MS default 10000
 */
const intEnv = (name: string, fallback: number, min = 0) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : fallback;
};

export const mongoConnectOptions = () => {
  const maxPoolSize = intEnv("MONGO_MAX_POOL_SIZE", 20, 1);
  return {
    serverSelectionTimeoutMS: intEnv("MONGO_SERVER_SELECTION_TIMEOUT_MS", 10_000, 1),
    maxPoolSize,
    minPoolSize: Math.min(intEnv("MONGO_MIN_POOL_SIZE", 0), maxPoolSize),
    socketTimeoutMS: intEnv("MONGO_SOCKET_TIMEOUT_MS", 45_000),
    waitQueueTimeoutMS: intEnv("MONGO_WAIT_QUEUE_TIMEOUT_MS", 10_000),
  };
};

let listenersBound = false;
// In-memory MongoDB server instance (for development/testing)
let memoryServer: MongoMemoryServer | null = null;

// Binds lifecycle telemetry handlers to the Mongoose connection instance once.
// Records successful connection establishment, operational errors, and disconnection events.
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

// Establishes a connection to the MongoDB database with automated development in-memory fallback.
// Enforces connection timeouts, configures connection pool sizing, and initializes event logging.
export const connectDB = async () => {
  const env = getEnv();
  // Bind connection event listeners (only once)
  bindConnectionListeners();

  // Initiates a Mongoose connection using the specified MongoDB connection string.
  // Configures a 10-second server selection timeout and a maximum connection pool size of 20.
  const connectWithUri = async (uri: string) => {
    await mongoose.connect(uri, mongoConnectOptions());
  };

  // Launches an in-memory MongoDB server instance for local development and integration tests.
  // Dynamically imports mongodb-memory-server to avoid loading testing dependencies in production.
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
    await runStartupMigrations();
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
  await runStartupMigrations();
};

// Connects to MongoDB requiring an explicit MONGO_URI string without fallback to in-memory databases.
// Used in production environments to prevent accidental creation of ephemeral database instances.
export const connectDBStrict = async () => {
  const env = getEnv();
  // Bind connection event listeners (only once)
  bindConnectionListeners();

  // MONGO_URI is required for strict connections
  if (!env.MONGO_URI) {
    throw new Error("MONGO_URI is required for strict database connections.");
  }

  // Connect to MongoDB with strict settings
  await mongoose.connect(env.MONGO_URI, mongoConnectOptions());
  await runStartupMigrations();
};

// Gracefully closes active Mongoose database connections and terminates in-memory test instances.
// Executed during server process shutdown sequences to release persistent network handles.
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
