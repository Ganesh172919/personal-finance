import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo: MongoMemoryServer | null = null;

export const startTestDb = async () => {
  mongo = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 30_000,
    },
  });
  const uri = mongo.getUri();
  await mongoose.connect(uri);
  return uri;
};

export const stopTestDb = async () => {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
    mongo = null;
  }
};

export const clearTestDb = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map(collection => collection.deleteMany({})));
};
