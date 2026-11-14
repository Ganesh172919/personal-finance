import { afterAll, beforeAll, describe, expect, it } from "vitest";

import MemoryRecordModel, { MEMORY_TEXT_INDEX_NAME } from "../models/memoryRecordModel";
import { migrateMemoryRecordTextIndex, runStartupMigrations } from "../services/dbMigrations";
import { startTestDb, stopTestDb } from "./testDb";

const textIndexes = async () =>
  ((await MemoryRecordModel.collection.indexes()) as any[]).filter(index => "_fts" in (index.key ?? {}) || Object.values(index.key ?? {}).includes("text"));

describe("memoryRecord text index migration", () => {
  beforeAll(async () => {
    await startTestDb();
    await MemoryRecordModel.init();
  });
  afterAll(async () => {
    await stopTestDb();
  });

  it("replaces the legacy unscoped text index with the orgId-scoped one, idempotently", async () => {
    // simulate a pre-migration deployment: only the old unscoped text index exists
    for (const index of await textIndexes()) await MemoryRecordModel.collection.dropIndex(index.name);
    await MemoryRecordModel.collection.createIndex({ key: "text", value: "text" }, { name: "key_text_value_text" });
    expect((await textIndexes()).map(i => i.name)).toEqual(["key_text_value_text"]);

    const first = await migrateMemoryRecordTextIndex();
    expect(first.dropped).toEqual(["key_text_value_text"]);
    expect(first.created).toBe(true);

    const after = await textIndexes();
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe(MEMORY_TEXT_INDEX_NAME);
    expect(after[0].key).toMatchObject({ orgId: 1 });

    const second = await migrateMemoryRecordTextIndex();
    expect(second).toEqual({ dropped: [], created: false });
    await runStartupMigrations(); // full startup pass is also safe to repeat
    expect(await textIndexes()).toHaveLength(1);
  });
});
