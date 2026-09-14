export const STORAGE_PREFIX = 'qa-community-seasons-v1:';

// Installed before the game imports. Production key declarations stay untouched.
export function isolateStorage(prototype) {
  const { getItem, setItem, removeItem, key } = prototype;
  const length = Object.getOwnPropertyDescriptor(prototype, 'length').get;
  const map = value => {
    const name = String(value);
    return name.startsWith('community-seasons-') ? STORAGE_PREFIX + name : name;
  };
  Object.defineProperties(prototype, {
    getItem: { configurable: true, writable: true, value(name) { return getItem.call(this, map(name)); } },
    setItem: { configurable: true, writable: true, value(name, value) { return setItem.call(this, map(name), value); } },
    removeItem: { configurable: true, writable: true, value(name) { return removeItem.call(this, map(name)); } },
    clear: { configurable: true, writable: true, value() {
      // A fixture reset must never clear other applications' or players' saves.
      for (let index = length.call(this) - 1; index >= 0; index--) {
        const name = key.call(this, index);
        if (name?.startsWith(STORAGE_PREFIX)) removeItem.call(this, name);
      }
    } },
  });
}
