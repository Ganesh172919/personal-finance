import RedisMock from "ioredis-mock";
import { afterEach, describe, expect, it } from "vitest";
import { scanDelete } from "../config/redis";
import { InMemoryEventBus, type EventBusEvent } from "../modules/realtime/eventBus";
import { RedisEventBus } from "../modules/realtime/redisEventBus";

const clients: InstanceType<typeof RedisMock>[] = [];
const buses: RedisEventBus[] = [];

const redis = (host: string) => {
  const client = new RedisMock({ host, port: 6379 });
  clients.push(client);
  return client;
};

/** A gateway replica: publisher connection + its own subscriber connection + local in-memory bus. */
const replica = (host: string, instanceId: string) => {
  const bus = new RedisEventBus({
    publisher: redis(host),
    subscriber: redis(host),
    local: new InMemoryEventBus(),
    instanceId,
  });
  buses.push(bus);
  return bus;
};

const event = (orgId: string, id: string): EventBusEvent => ({
  kind: "domain_event",
  orgId,
  event: {
    id,
    org_id: orgId,
    type: "transaction.created",
    aggregate_type: "transaction",
    aggregate_id: "t1",
    action_link_id: null,
    request_id: null,
    payload: {},
    created_at: null,
  },
});

const waitFor = async (predicate: () => boolean, ms = 1000) => {
  const deadline = Date.now() + ms;
  while (!predicate() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
};

afterEach(async () => {
  await Promise.all(buses.splice(0).map((b) => b.close()));
  for (const c of clients.splice(0)) c.disconnect();
});

describe("RedisEventBus (two replicas)", () => {
  it("delivers an event published on replica A to subscribers on replica B and A exactly once each", async () => {
    const host = "bus-fanout";
    const a = replica(host, "replica-a");
    const b = replica(host, "replica-b");

    const onA: string[] = [];
    const onB: string[] = [];
    a.subscribe({ orgId: "org1", onEvent: (e) => onA.push(e.event.id) });
    b.subscribe({ orgId: "org1", onEvent: (e) => onB.push(e.event.id) });
    await Promise.all([a.flush(), b.flush()]);

    a.publish(event("org1", "evt-1"));
    await waitFor(() => onB.length > 0);
    await new Promise((r) => setTimeout(r, 20));

    expect(onA).toEqual(["evt-1"]); // own publish: delivered locally, echo suppressed
    expect(onB).toEqual(["evt-1"]);
  });

  it("is tenant scoped: other orgs never see the event", async () => {
    const host = "bus-tenant";
    const a = replica(host, "replica-a");
    const b = replica(host, "replica-b");

    const org1: string[] = [];
    const org2: string[] = [];
    b.subscribe({ orgId: "org1", onEvent: (e) => org1.push(e.event.id) });
    b.subscribe({ orgId: "org2", onEvent: (e) => org2.push(e.event.id) });
    await b.flush();

    a.publish(event("org1", "evt-org1"));
    await waitFor(() => org1.length > 0);
    await new Promise((r) => setTimeout(r, 30));

    expect(org1).toEqual(["evt-org1"]);
    expect(org2).toEqual([]);
  });

  it("stops delivering after the last local subscriber closes (unsubscribes the channel)", async () => {
    const host = "bus-close";
    const a = replica(host, "replica-a");
    const b = replica(host, "replica-b");

    const seen: string[] = [];
    const sub = b.subscribe({ orgId: "org1", onEvent: (e) => seen.push(e.event.id) });
    await b.flush();
    a.publish(event("org1", "evt-1"));
    await waitFor(() => seen.length > 0);

    sub.close();
    await b.flush();
    a.publish(event("org1", "evt-2"));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual(["evt-1"]);
  });

  it("never loses same-replica delivery when Redis publishing fails", async () => {
    const bus = new RedisEventBus({
      publisher: { publish: () => Promise.reject(new Error("redis down")) },
      subscriber: { subscribe: async () => 1, unsubscribe: async () => 1, on: () => undefined },
      local: new InMemoryEventBus(),
      instanceId: "solo",
    });
    const seen: string[] = [];
    bus.subscribe({ orgId: "org1", onEvent: (e) => seen.push(e.event.id) });
    bus.publish(event("org1", "evt-1"));
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual(["evt-1"]);
  });
});

describe("scanDelete", () => {
  // Real Redis guarantees SCAN returns every key present for the whole iteration even while keys are
  // deleted; ioredis-mock indexes into the live key list, so use a faithful fake instead.
  const fakeRedis = (keys: string[]) => {
    const live = new Set(keys);
    const snapshot = [...keys];
    const calls = { scan: 0, unlinkBatches: [] as number[] };
    return {
      live,
      calls,
      scan: async (cursor: string, _match: "MATCH", pattern: string, _count: "COUNT", count: number) => {
        calls.scan += 1;
        const start = Number(cursor);
        const page = snapshot.slice(start, start + count);
        const next = start + count >= snapshot.length ? "0" : String(start + count);
        const prefix = pattern.replace(/\*$/, "");
        return [next, page.filter((k) => live.has(k) && k.startsWith(prefix))] as [string, string[]];
      },
      unlink: async (...toDelete: string[]) => {
        calls.unlinkBatches.push(toDelete.length);
        return toDelete.filter((k) => live.delete(k)).length;
      },
    };
  };

  it("deletes only matching keys, paging with SCAN + UNLINK (never KEYS)", async () => {
    const keys = Array.from({ length: 450 }, (_, i) => `cache:org1:item:${i}`);
    const fake = fakeRedis([...keys, "cache:org2:item:1"]);

    const removed = await scanDelete(fake as never, "cache:org1:*", 100);

    expect(removed).toBe(450);
    expect(fake.calls.scan).toBe(5);
    expect([...fake.live]).toEqual(["cache:org2:item:1"]);
  });

  it("is non-fatal when Redis errors", async () => {
    const broken = { scan: async () => Promise.reject(new Error("boom")), unlink: async () => 0 };
    await expect(scanDelete(broken as never, "x:*")).resolves.toBe(0);
  });
});
