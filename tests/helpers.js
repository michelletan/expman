import { STORES, clearStore } from '../src/lib/data/db.js';

// db.js caches its IndexedDB connection at module scope, so tests share
// one physical (fake-indexeddb) database across the whole run. Call this
// in beforeEach to give every test a clean slate instead.
export async function resetDB() {
  for (const store of STORES) await clearStore(store);
}
