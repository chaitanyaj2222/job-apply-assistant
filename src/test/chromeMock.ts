type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

// Minimal in-memory chrome.storage (local + session) with onChanged support.
export function installChromeMock() {
  const listeners = new Set<Listener>();
  const makeArea = (areaName: string) => {
    let data: Record<string, unknown> = {};
    return {
      async get(keys?: string | string[] | null) {
        const clone = structuredClone(data);
        if (keys == null) return clone;
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((k) => k in clone).map((k) => [k, clone[k]]));
      },
      async set(items: Record<string, unknown>) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data[k], newValue: structuredClone(v) };
          data[k] = structuredClone(v);
        }
        listeners.forEach((l) => l(changes, areaName));
      },
      async remove(keys: string | string[]) {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
      },
      async clear() {
        data = {};
      },
    };
  };
  const chromeMock = {
    storage: {
      local: makeArea("local"),
      session: makeArea("session"),
      onChanged: {
        addListener: (l: Listener) => listeners.add(l),
        removeListener: (l: Listener) => listeners.delete(l),
      },
    },
    runtime: {
      onMessage: { addListener: () => {}, removeListener: () => {} },
      sendMessage: async () => undefined,
      openOptionsPage: async () => {},
    },
  };
  (globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;
  return chromeMock;
}
