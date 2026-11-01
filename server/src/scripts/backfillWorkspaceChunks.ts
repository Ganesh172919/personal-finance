import "dotenv/config";
import mongoose from "mongoose";

import WorkspaceFileModel from "../models/workspaceFileModel";
import { chunkWorkspaceTextForRetrieval, ensureWorkspaceFileChunks } from "../services/retrievalService";

// Usage: npm run backfill:retrieval -- --org-id <id> [--user-id <id>] [--dry-run]
const main = async () => {
  const args = process.argv.slice(2);
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === "--dry-run") {
      flags.set(flag, true);
    } else if (flag === "--org-id" || flag === "--user-id") {
      const value = args[++index];
      if (!value || !mongoose.Types.ObjectId.isValid(value)) throw new Error(`${flag} requires a valid ObjectId`);
      flags.set(flag, value);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!flags.has("--org-id")) throw new Error("--org-id is required to scope the backfill");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const scope = {
      orgId: new mongoose.Types.ObjectId(String(flags.get("--org-id"))),
      ...(flags.has("--user-id") ? { userId: new mongoose.Types.ObjectId(String(flags.get("--user-id"))) } : {}),
    };
    const summary = { dryRun: flags.has("--dry-run"), files: 0, chunks: 0, failed: 0 };
    const cursor = WorkspaceFileModel.find(scope).lean().cursor({ batchSize: 25 });
    for await (const file of cursor) {
      summary.files++;
      try {
        if (summary.dryRun) {
          summary.chunks += chunkWorkspaceTextForRetrieval({ text: file.extractedText || "", pageCount: file.extractedPageCount }).length;
        } else {
          const result = await ensureWorkspaceFileChunks({
            orgId: file.orgId, userId: file.userId, workspaceFileId: file._id, fileId: file.fileId,
            originalName: file.originalName, sourceKind: file.kind, extractedText: file.extractedText || "",
            pageCount: file.extractedPageCount,
          });
          summary.chunks += result.created + result.existing;
        }
      } catch (error) {
        summary.failed++;
        console.error(`Indexing failed for workspace file ${file._id}`, error);
      }
    }
    console.log(JSON.stringify(summary));
    if (summary.failed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Workspace chunk backfill failed:", error);
  process.exitCode = 1;
});
