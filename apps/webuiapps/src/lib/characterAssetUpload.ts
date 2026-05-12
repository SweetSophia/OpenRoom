/**
 * Character asset upload utilities
 * Handles image/video uploads for character avatars
 */

import { putBinaryFile, deleteFilesByPaths, buildFileUrl } from './diskStorage';

const CHARACTER_ASSETS_PATH = '/characters';
export const MAX_CHARACTER_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHARACTER_VIDEO_BYTES = 50 * 1024 * 1024;

export const CHARACTER_IMAGE_MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
} as const;

export const CHARACTER_VIDEO_MIME_TO_EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
} as const;

const IMAGE_EXTENSIONS = new Set(Object.values(CHARACTER_IMAGE_MIME_TO_EXT));
const VIDEO_EXTENSIONS = new Set(Object.values(CHARACTER_VIDEO_MIME_TO_EXT));
const ALLOWED_CHARACTER_ASSET_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  'ogg',
]);
const LOCAL_CHARACTER_ASSET_PATH_PATTERN = new RegExp(
  `^${escapeRegExp(CHARACTER_ASSETS_PATH)}/([A-Za-z0-9_-]+)/emotions/([A-Za-z0-9_-]+)\\.([A-Za-z0-9]+)$`,
);
let fallbackUniqueAssetId = 0;

const CHARACTER_IMAGE_EXTENSIONS = new Set([...Object.values(CHARACTER_IMAGE_MIME_TO_EXT), 'jpeg']);
const CHARACTER_VIDEO_EXTENSIONS = new Set([...Object.values(CHARACTER_VIDEO_MIME_TO_EXT), 'ogg']);

type CharacterAssetType = 'image' | 'video';

function sanitizePathComponent(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64)
    .replace(/^_+|_+$/g, '');
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function getExtension(mimeType: string, type: CharacterAssetType): string {
  const mimeMap = type === 'image' ? CHARACTER_IMAGE_MIME_TO_EXT : CHARACTER_VIDEO_MIME_TO_EXT;
  const ext = mimeMap[mimeType as keyof typeof mimeMap];
  if (!ext) {
    throw new Error(`Unsupported ${type} MIME type: ${mimeType || 'unknown'}`);
  }
  return ext;
}

function assertFileSize(file: File, type: CharacterAssetType): void {
  const maxBytes = type === 'image' ? MAX_CHARACTER_IMAGE_BYTES : MAX_CHARACTER_VIDEO_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`Character ${type} asset exceeds ${maxBytes} bytes`);
  }
}

function assertSafePathComponent(value: string, label: string): string {
  const sanitizedValue = sanitizePathComponent(value);
  if (!sanitizedValue) {
    throw new Error(`Invalid ${label}`);
  }
  return sanitizedValue;
}

function createUniqueAssetFilename(safeEmotion: string, ext: string): string {
  const cryptoApi = globalThis.crypto;
  let random: string;

  if (cryptoApi?.randomUUID) {
    random = cryptoApi.randomUUID();
  } else if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } else {
    random = `${Date.now()}-${fallbackUniqueAssetId++}`;
  }

  return `${safeEmotion}-${Date.now()}-${random}.${ext}`;
}

function containsEncodedTraversal(path: string): boolean {
  try {
    return decodeURIComponent(path).includes('..');
  } catch {
    return true;
  }
}

function parseLocalCharacterAssetPath(path?: string): { ext: string } | undefined {
  if (!path || isExternalOrDataUrl(path)) return undefined;
  if (path.includes('\\') || path.includes('//') || path.includes('..')) return undefined;
  if (containsEncodedTraversal(path)) return undefined;

  const match = path.match(LOCAL_CHARACTER_ASSET_PATH_PATTERN);
  if (!match) return undefined;

  const ext = match[3].toLowerCase();
  if (!ALLOWED_CHARACTER_ASSET_EXTENSIONS.has(ext)) return undefined;
  return { ext };
}

function getAssetUrlExtension(url?: string): string | undefined {
  const pathname = url?.trim()?.split(/[?#]/, 1)[0];
  const extension = pathname?.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  return extension;
}

export function isVideoAssetUrl(url?: string): boolean {
  if (url?.startsWith('data:video/')) return true;
  const extension = getAssetUrlExtension(url);
  return !!extension && CHARACTER_VIDEO_EXTENSIONS.has(extension);
}

export function isImageAssetUrl(url?: string): boolean {
  if (url?.startsWith('data:image/')) return true;
  const extension = getAssetUrlExtension(url);
  return !!extension && CHARACTER_IMAGE_EXTENSIONS.has(extension);
}

export function isExternalOrDataUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:');
}

export function isLocalCharacterAssetPath(path?: string): path is string {
  return !!parseLocalCharacterAssetPath(path);
}

type ImageExt = 'png' | 'jpg' | 'webp' | 'gif' | 'svg';
type VideoExt = 'mp4' | 'webm' | 'ogv' | 'mov';

export function getCharacterAssetKind(path?: string): CharacterAssetType | undefined {
  const parsedPath = parseLocalCharacterAssetPath(path);
  if (!parsedPath) return undefined;
  if (IMAGE_EXTENSIONS.has(parsedPath.ext as ImageExt)) return 'image';
  if (VIDEO_EXTENSIONS.has(parsedPath.ext as VideoExt)) return 'video';
  return undefined;
}

export async function deleteCharacterAsset(path?: string): Promise<void> {
  if (!isLocalCharacterAssetPath(path)) return;
  await deleteFilesByPaths({ file_paths: [path] });
}

/**
 * Upload a character asset (image or video) and return the storage path.
 * Works in production mode via diskStorage API.
 */
export async function uploadCharacterAsset(
  characterId: string,
  emotion: string,
  file: File,
  type: CharacterAssetType,
): Promise<string> {
  assertFileSize(file, type);
  const ext = getExtension(file.type, type);
  const sanitizedCharacterId = assertSafePathComponent(characterId, 'characterId');
  const sanitizedEmotion = assertSafePathComponent(emotion, 'emotion');
  const filename = createUniqueAssetFilename(sanitizedEmotion, ext);
  const storagePath = `${CHARACTER_ASSETS_PATH}/${sanitizedCharacterId}/emotions/${filename}`;
  const base64 = await fileToBase64(file);
  await putBinaryFile(storagePath, base64, file.type);
  return storagePath;
}

/**
 * Get the display URL for a character asset.
 * Returns a streamed file URL for local files, original path for external URLs.
 */
export function getCharacterAssetUrl(path: string): string | undefined {
  if (isExternalOrDataUrl(path)) {
    return path;
  }
  if (!isLocalCharacterAssetPath(path)) {
    return undefined;
  }
  return buildFileUrl(path);
}
