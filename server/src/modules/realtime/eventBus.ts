type DomainEventPayload = {
  id: string;
  org_id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  action_link_id: string | null;
  request_id: string | null;
  payload: Record<string, unknown>;
  created_at: string | null;
};

export type EventBusEvent = {
  kind: "domain_event";
  orgId: string;
  event: DomainEventPayload;
};

export type EventBusSubscription = { close: () => void };

export interface EventBus {
  publish: (event: EventBusEvent) => void;
  subscribe: (params: { orgId: string; onEvent: (event: EventBusEvent) => void }) => EventBusSubscription;
}

class InMemoryEventBus implements EventBus {
  private listenersByOrg = new Map<string, Set<(event: EventBusEvent) => void>>();
  private recentlySeenEventIdsByOrg = new Map<string, Map<string, number>>();

  private static readonly EVENT_DEDUP_TTL_MS = 10 * 60 * 1000;
  private static readonly EVENT_DEDUP_MAX_PER_ORG = 2000;

  private shouldDropDuplicate(event: EventBusEvent) {
    const id = String(event.event?.id || "");
    if (!id) return false;

    const orgId = String(event.orgId || "");
    if (!orgId) return false;

    const now = Date.now();
    const ttlMs = InMemoryEventBus.EVENT_DEDUP_TTL_MS;

    let map = this.recentlySeenEventIdsByOrg.get(orgId);
    if (!map) {
      map = new Map();
      this.recentlySeenEventIdsByOrg.set(orgId, map);
    }

    const seenAt = map.get(id);
    if (typeof seenAt === "number" && now - seenAt < ttlMs) {
      return true;
    }

    map.set(id, now);

    if (map.size <= InMemoryEventBus.EVENT_DEDUP_MAX_PER_ORG) {
      return false;
    }

    for (const [key, ts] of map.entries()) {
      if (now - ts >= ttlMs) {
        map.delete(key);
      }
    }

    while (map.size > InMemoryEventBus.EVENT_DEDUP_MAX_PER_ORG) {
      const oldest = map.keys().next().value as string | undefined;
      if (!oldest) break;
      map.delete(oldest);
    }

    return false;
  }

  publish(event: EventBusEvent) {
    if (this.shouldDropDuplicate(event)) {
      return;
    }

    const listeners = this.listenersByOrg.get(event.orgId);
    if (!listeners || listeners.size === 0) return;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must never crash publisher paths.
      }
    }
  }

  subscribe(params: { orgId: string; onEvent: (event: EventBusEvent) => void }): EventBusSubscription {
    const orgId = String(params.orgId);
    const onEvent = params.onEvent;

    let listeners = this.listenersByOrg.get(orgId);
    if (!listeners) {
      listeners = new Set();
      this.listenersByOrg.set(orgId, listeners);
    }

    listeners.add(onEvent);

    return {
      close: () => {
        const current = this.listenersByOrg.get(orgId);
        if (!current) return;
        current.delete(onEvent);
        if (current.size === 0) {
          this.listenersByOrg.delete(orgId);
          this.recentlySeenEventIdsByOrg.delete(orgId);
        }
      },
    };
  }
}

let singleton: EventBus | null = null;

export const getEventBus = (): EventBus => {
  if (!singleton) {
    singleton = new InMemoryEventBus();
  }
  return singleton;
};
