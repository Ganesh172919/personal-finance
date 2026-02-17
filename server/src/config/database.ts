import mongoose from "mongoose";
import type { MongoMemoryServer } from "mongodb-memory-server";
import { getEnv } from "./env";

let listenersBound = false;
let memoryServer: MongoMemoryServer | null = null;

const bindConnectionListeners = () => {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  mongoose.connection.on("connected", () => {
    console.log("Mongoose connected to the database.");
  });

  mongoose.connection.on("error", (error) => {
    console.error("Mongoose connection error:", error);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("Mongoose disconnected from the database.");
  });
};

export const connectDB = async () => {
  const env = getEnv();
  bindConnectionListeners();
  const connectWithUri = async (uri: string) => {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
    });
  };

  const connectWithInMemory = async (reason: string) => {
    console.warn(`${reason} Falling back to in-memory MongoDB.`);

    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: "finwise-local",
      },
    });

    const memoryUri = memoryServer.getUri();
    await connectWithUri(memoryUri);

    console.warn(`Using in-memory MongoDB at ${memoryUri}`);
  };

  if (!env.MONGO_URI) {
    if (env.NODE_ENV === "production") {
      throw new Error("MONGO_URI is not defined in the environment configuration.");
    }

    await connectWithInMemory("MONGO_URI is not configured in non-production mode.");
    return;
  }

  try {
    await connectWithUri(env.MONGO_URI);
  } catch (error) {
    if (env.NODE_ENV === "production") {
      throw error;
    }
    await connectWithInMemory("Primary MongoDB connection failed in non-production mode.");
  }
};

export const closeDB = async () => {
  await mongoose.disconnect();

  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};
