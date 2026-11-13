import { vi } from 'vitest';

// PDF helpers import these native modules at module load time. Component tests
// exercise their web paths, so native print and share APIs are inert here.
vi.mock('expo-print', () => ({ printToFileAsync: vi.fn() }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
