import mongoose from "mongoose";
import dotenv from "dotenv";
import FinancialProfileModel from "../models/financialProfileModel";
import { ensureProfileTransactionsMigrated } from "../services/transactionMigration";

dotenv.config();

async function migrateTransactions() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const cursor = FinancialProfileModel.find({
    transactionsMigratedAt: { $exists: false },
    "transactions.0": { $exists: true }
  }).cursor();

  let scanned = 0;
  let migratedProfiles = 0;
  let migratedEmbeddedTx = 0;

  for await (const profile of cursor) {
    scanned += 1;
    const result = await ensureProfileTransactionsMigrated(profile);
    if (result.migrated) {
      migratedProfiles += 1;
      migratedEmbeddedTx += result.embeddedCount;
      console.log(
        `Migrated userId=${profile.userId.toString()} embedded=${result.embeddedCount} total=${result.totalTransactions}`
      );
    }
  }

  console.log("✅ Migration complete");
  console.log(`Profiles scanned: ${scanned}`);
  console.log(`Profiles migrated: ${migratedProfiles}`);
  console.log(`Embedded transactions migrated: ${migratedEmbeddedTx}`);

  await mongoose.disconnect();
}

migrateTransactions()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });

