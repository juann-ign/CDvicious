/** One SDK command lane, including the existing flight mute/restore transaction. */
const wrappers = new WeakMap<object, object>();
export function serializedPlayerVolume<T extends object>(player: T): T {
  const cached = wrappers.get(player);
  if (cached) return cached as T;
  let lane: Promise<unknown> = Promise.resolve();
  const queuedMethods = new Set(["getVolume", "setVolume", "togglePlay", "previousTrack", "nextTrack", "pause", "resume", "seek"]);
  const methods = new Map<PropertyKey, unknown>();
  const proxy = new Proxy(player, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (!methods.has(key)) methods.set(key, typeof key === "string" && queuedMethods.has(key)
        ? (...args: unknown[]) => {
          const operation = lane.then(() => {
            const current: unknown = Reflect.get(target, key, target);
            if (typeof current !== "function") throw new TypeError("The SDK command is no longer available.");
            return Reflect.apply(current, target, args);
          });
          // Rejection cannot poison later restore/read operations.
          lane = operation.catch(() => undefined);
          return operation;
        }
        : value.bind(target));
      return methods.get(key);
    },
  });
  wrappers.set(player, proxy);
  return proxy;
}
