/**
 * Character asset upload utilities
 * Handles image/video uploads for character avatars
 */

import { putBinaryFile, getBinaryFile } from './diskStorage';

const CHARACTER_ASSETS_PATH = '/characters';

function sanitizePathComponent(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 64)
    .replace(/^_+|_+$/g, '');
}

/**
 * Convert a File object to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error('Failed to extract base64 from file'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
};

function getExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || 'bin';
}

function isExternalUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:');
}

/**
 * Upload a character asset (image or video) and return the storage path.
 * Works in production mode via diskStorage API.
 */
export async function uploadCharacterAsset(
  characterId: string,
  emotion: string,
  file: File,
  _type: 'image' | 'video',
): Promise<string> {
  const ext = getExtension(file.type);
  const sanitizedCharacterId = sanitizePathComponent(characterId);
  const sanitizedEmotion = sanitizePathComponent(emotion);
  const storagePath = `${CHARACTER_ASSETS_PATH}/${sanitizedCharacterId}/emotions/${sanitizedEmotion}.${ext}`;
  const base64 = await fileToBase64(file);
  await putBinaryFile(storagePath, base64, file.type);
  return storagePath;
}

/**
 * Get the display URL for a character asset.
 * Returns data URL for local files, original path for external URLs.
 */
export async function getCharacterAssetUrl(path: string): Promise<string> {
  if (isExternalUrl(path)) {
    return path;
  }
  const result = await getBinaryFile(path);
  if (result) {
    return `data:${result.mimeType};base64,${result.base64}`;
  }
  return path;
}
