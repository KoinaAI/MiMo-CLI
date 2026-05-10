import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandMediaAttachments } from '../src/ui/media.js';

describe('media attachments', () => {
  it('expands mentioned image files into multimodal content blocks', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-media-'));
    await writeFile(path.join(cwd, 'shot.png'), Buffer.from([137, 80, 78, 71]));

    const result = await expandMediaAttachments('describe @shot.png', cwd);

    expect(result.attached).toEqual(['shot.png']);
    expect(result.missing).toEqual([]);
    expect(result.content).toEqual([
      { type: 'text', text: 'describe [attached image: shot.png]' },
      { type: 'image', mediaType: 'image/png', data: 'iVBORw==', name: 'shot.png' },
    ]);
  });
});
