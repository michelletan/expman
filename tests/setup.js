// Polyfills indexedDB in the jsdom test environment — db.js runs
// completely unmodified against it. Auto-registers on globalThis.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Without this, each render() in a test file leaves its component
// mounted, so later tests in the same file see duplicate DOM from every
// previous render().
afterEach(cleanup);
