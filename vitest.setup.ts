import { expect } from 'vitest';
import '@testing-library/jest-dom';
import { File as NodeFile } from 'buffer';

if (typeof globalThis.File === 'undefined') {
  globalThis.File = NodeFile as unknown as typeof File;
}
