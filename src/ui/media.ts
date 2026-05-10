import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatContentBlock } from '../types.js';

const MEDIA_TYPES: Record<string, { type: 'image' | 'video' | 'audio'; mediaType: string }> = {
  '.png': { type: 'image', mediaType: 'image/png' },
  '.jpg': { type: 'image', mediaType: 'image/jpeg' },
  '.jpeg': { type: 'image', mediaType: 'image/jpeg' },
  '.webp': { type: 'image', mediaType: 'image/webp' },
  '.gif': { type: 'image', mediaType: 'image/gif' },
  '.mp4': { type: 'video', mediaType: 'video/mp4' },
  '.webm': { type: 'video', mediaType: 'video/webm' },
  '.mov': { type: 'video', mediaType: 'video/quicktime' },
  '.mp3': { type: 'audio', mediaType: 'audio/mpeg' },
  '.wav': { type: 'audio', mediaType: 'audio/wav' },
  '.m4a': { type: 'audio', mediaType: 'audio/mp4' },
  '.ogg': { type: 'audio', mediaType: 'audio/ogg' },
};

export interface MediaExpansion {
  prompt: string;
  content: ChatContentBlock[] | undefined;
  attached: string[];
  missing: string[];
}

export async function expandMediaAttachments(prompt: string, cwd: string): Promise<MediaExpansion> {
  const matches = [...prompt.matchAll(/(^|\s)@([^\s@][^\s]*)/gu)];
  const blocks: ChatContentBlock[] = [];
  const attached: string[] = [];
  const missing: string[] = [];
  let text = prompt;

  for (const match of matches) {
    const rel = match[2] ?? '';
    const media = mediaTypeForPath(rel);
    if (!media) continue;
    const abs = path.resolve(cwd, rel);
    if (!abs.startsWith(path.resolve(cwd))) {
      missing.push(rel);
      continue;
    }
    try {
      const data = await readFile(abs);
      blocks.push({ ...media, data: data.toString('base64'), name: rel });
      attached.push(rel);
      text = text.replace(match[0], `${match[1] ?? ''}[attached ${media.type}: ${rel}]`);
    } catch {
      missing.push(rel);
    }
  }

  if (blocks.length === 0) return { prompt, content: undefined, attached, missing };
  return {
    prompt: text,
    content: [{ type: 'text', text }, ...blocks],
    attached,
    missing,
  };
}

export function isMediaPath(value: string): boolean {
  return mediaTypeForPath(value) !== undefined;
}

function mediaTypeForPath(value: string): { type: 'image' | 'video' | 'audio'; mediaType: string } | undefined {
  return MEDIA_TYPES[path.extname(value).toLowerCase()];
}
