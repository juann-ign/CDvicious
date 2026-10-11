type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

type ServerCacheStore = Map<string, CacheEntry>;
type ServerInFlightStore = Map<string, Promise<unknown>>;

type ServerCacheGlobal = typeof globalThis & {
  __CDV_SERVER_CACHE__?: ServerCacheStore;
  __CDV_SERVER_INFLIGHT__?: ServerInFlightStore;
};

const serverGlobal = globalThis as ServerCacheGlobal;

const cache =
  serverGlobal.__CDV_SERVER_CACHE__ ??
  (serverGlobal.__CDV_SERVER_CACHE__ = new Map<string, CacheEntry>());

const inFlight =
  serverGlobal.__CDV_SERVER_INFLIGHT__ ??
  (serverGlobal.__CDV_SERVER_INFLIGHT__ = new Map<
    string,
    Promise<unknown>
  >());

const DEBUG_CACHE = process.env.NEXT_PUBLIC_DEBUG_SPOTIFY_CACHE === "1";

function debug(event: string, key: string) {
  if (!DEBUG_CACHE || process.env.NODE_ENV === "production") return;

  console.debug("[server-cache]", event, key.slice(0, 48));
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loaderFn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);

  if (entry) {
    if (entry.expiresAt > now) {
      debug("HIT", key);
      return entry.value as T;
    }

    cache.delete(key);
    debug("EXPIRED", key);
  }

  const pending = inFlight.get(key);

  if (pending) {
    debug("IN_FLIGHT", key);
    return pending as Promise<T>;
  }

  debug("MISS", key);

  const request = loaderFn();

  inFlight.set(key, request);

  try {
    const value = await request;

    cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    debug("SET", key);

    return value;
  } finally {
    if (inFlight.get(key) === request) {
      inFlight.delete(key);
    }
  }
}
