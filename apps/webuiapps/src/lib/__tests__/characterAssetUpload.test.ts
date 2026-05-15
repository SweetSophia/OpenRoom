import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diskStorage', () => ({
  putBinaryFile: vi.fn().mockResolvedValue(undefined),
  getBinaryFile: vi.fn().mockResolvedValue(null),
  deleteFilesByPaths: vi.fn().mockResolvedValue(undefined),
  buildFileUrl: vi.fn((path: string) => `/api/session-data?path=apps${encodeURIComponent(path)}`),
}));

import {
  CHARACTER_IMAGE_MIME_TO_EXT,
  CHARACTER_VIDEO_MIME_TO_EXT,
  getCharacterAssetKind,
  getCharacterAssetUrl,
  isImageAssetUrl,
  isVideoAssetUrl,
  isLocalCharacterAssetPath,
  MAX_CHARACTER_VIDEO_BYTES,
  uploadCharacterAsset,
  deleteCharacterAsset,
  sanitizeCharacterAssetTestIdPart,
} from '../characterAssetUpload';
import { buildFileUrl, deleteFilesByPaths, getBinaryFile, putBinaryFile } from '../diskStorage';

const mockPutBinaryFile = vi.mocked(putBinaryFile);
const mockGetBinaryFile = vi.mocked(getBinaryFile);
const mockDeleteFilesByPaths = vi.mocked(deleteFilesByPaths);
const mockBuildFileUrl = vi.mocked(buildFileUrl);

function createFile(type: string): File {
  return new File(['asset'], 'asset', { type });
}

function createFileWithSize(type: string, size: number): File {
  const file = createFile(type);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const supportedUploads = [
  ...Object.entries(CHARACTER_IMAGE_MIME_TO_EXT).map(([mimeType, extension]) => ({
    mimeType,
    extension,
    type: 'image' as const,
  })),
  ...Object.entries(CHARACTER_VIDEO_MIME_TO_EXT).map(([mimeType, extension]) => ({
    mimeType,
    extension,
    type: 'video' as const,
  })),
];

const supportedExtensions = [
  ...Object.values(CHARACTER_IMAGE_MIME_TO_EXT).map((extension) => ({
    extension,
    type: 'image' as const,
  })),
  ...Object.values(CHARACTER_VIDEO_MIME_TO_EXT).map((extension) => ({
    extension,
    type: 'video' as const,
  })),
];

describe('characterAssetUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPutBinaryFile.mockResolvedValue(undefined);
    mockGetBinaryFile.mockResolvedValue({ base64: 'Zm9v', mimeType: 'image/png' });
    mockDeleteFilesByPaths.mockResolvedValue(undefined);
  });

  it('rejects traversal and unsafe local asset paths', () => {
    const unsafePaths = [
      '/characters/../../x',
      '/characters/a/emotions/../x.png',
      '/characters/a/emotions/%2e%2e%2fx.png',
      '/characters/a\\emotions\\x.png',
      '/characters//a/emotions/x.png',
      '/other/a/emotions/x.png',
    ];

    for (const path of unsafePaths) {
      expect(isLocalCharacterAssetPath(path)).toBe(false);
      expect(getCharacterAssetKind(path)).toBeUndefined();
    }
  });

  it('does not delete or read unsafe local paths', async () => {
    const unsafePath = '/characters/a/emotions/%2e%2e%2fx.png';

    await deleteCharacterAsset(unsafePath);
    expect(getCharacterAssetUrl(unsafePath)).toBeUndefined();

    expect(mockDeleteFilesByPaths).not.toHaveBeenCalled();
    expect(mockGetBinaryFile).not.toHaveBeenCalled();
    expect(mockBuildFileUrl).not.toHaveBeenCalled();
  });

  it('streams valid local asset paths through the session-data API', async () => {
    const imagePath = '/characters/agent_1/emotions/happy-1700000000000-abc123xy.png';

    expect(getCharacterAssetUrl(imagePath)).toMatch(
      /^\/api\/session-data\?path=apps%2Fcharacters%2Fagent_1%2Femotions%2Fhappy-1700000000000-abc123xy\.png$/,
    );

    expect(mockBuildFileUrl).toHaveBeenCalledWith(imagePath);
    expect(mockGetBinaryFile).not.toHaveBeenCalled();
  });

  it('accepts valid uploaded-style paths', () => {
    const imagePath = '/characters/agent_1/emotions/happy-1700000000000-abc123xy.png';
    const videoPath = '/characters/agent-1/emotions/idle-1700000000000-abc123xy.mov';

    expect(isLocalCharacterAssetPath(imagePath)).toBe(true);
    expect(getCharacterAssetKind(imagePath)).toBe('image');
    expect(isLocalCharacterAssetPath(videoPath)).toBe(true);
    expect(getCharacterAssetKind(videoPath)).toBe('video');
  });

  it.each(supportedExtensions)('maps .$extension paths to $type assets', ({ extension, type }) => {
    const path = `/characters/agent_1/emotions/happy-1700000000000-abc123xy.${extension}`;

    expect(isLocalCharacterAssetPath(path)).toBe(true);
    expect(getCharacterAssetKind(path)).toBe(type);
  });

  it('detects video asset URLs with query strings and hashes', () => {
    expect(isVideoAssetUrl('https://cdn.example.com/avatar.mp4?version=1')).toBe(true);
    expect(isVideoAssetUrl('https://cdn.example.com/avatar.webm#preview')).toBe(true);
    expect(isVideoAssetUrl('/characters/agent/emotions/idle.mov?token=abc#clip')).toBe(true);
    expect(isVideoAssetUrl('https://cdn.example.com/avatar.ogg?cache=bust')).toBe(true);
    expect(isVideoAssetUrl('https://cdn.example.com/avatar.ogv#loop')).toBe(true);
    expect(isVideoAssetUrl('https://cdn.example.com/avatar.png?format=webp')).toBe(false);
  });

  it('detects image asset URLs with query strings and hashes', () => {
    expect(isImageAssetUrl('https://cdn.example.com/avatar.jpg?version=1')).toBe(true);
    expect(isImageAssetUrl('https://cdn.example.com/avatar.png#preview')).toBe(true);
    expect(isImageAssetUrl('https://cdn.example.com/avatar.jpeg?format=webp')).toBe(true);
    expect(isImageAssetUrl('https://cdn.example.com/avatar.webp')).toBe(true);
    expect(isImageAssetUrl('https://cdn.example.com/avatar.gif?v=2')).toBe(true);
    expect(isImageAssetUrl('https://cdn.example.com/avatar.mp4?token=abc')).toBe(false);
  });

  it('detects image data: URLs', () => {
    expect(isImageAssetUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImageAssetUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isImageAssetUrl('data:image/gif;base64,R0lGODlh')).toBe(true);
  });

  it('detects video data: URLs', () => {
    expect(isVideoAssetUrl('data:video/mp4;base64,AAAAHGZ0eXBpc29tAA==')).toBe(true);
    expect(isVideoAssetUrl('data:video/webm;base64,AAAAHGZ0eXBpc29tAA==')).toBe(true);
  });

  it('accepts .jpeg extension for external URLs', () => {
    expect(isImageAssetUrl('https://cdn.example.com/photo.jpeg')).toBe(true);
    expect(isImageAssetUrl('https://cdn.example.com/photo.jpg?size=large')).toBe(true);
  });

  it('rejects unsupported MIME types before storage', async () => {
    await expect(
      uploadCharacterAsset('agent', 'happy', createFile('application/octet-stream'), 'image'),
    ).rejects.toThrow('Unsupported image MIME type');

    expect(mockPutBinaryFile).not.toHaveBeenCalled();
  });

  it('rejects mismatched requested asset type before storage', async () => {
    await expect(
      uploadCharacterAsset('agent', 'happy', createFile('video/mp4'), 'image'),
    ).rejects.toThrow('Unsupported image MIME type');
    await expect(
      uploadCharacterAsset('agent', 'happy', createFile('image/png'), 'video'),
    ).rejects.toThrow('Unsupported video MIME type');

    expect(mockPutBinaryFile).not.toHaveBeenCalled();
  });

  it('creates unique versioned safe upload paths', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const firstPath = await uploadCharacterAsset(
      'agent/one',
      'happy face',
      createFile('image/png'),
      'image',
    );
    const secondPath = await uploadCharacterAsset(
      'agent/one',
      'happy face',
      createFile('image/png'),
      'image',
    );

    expect(firstPath).toMatch(
      /^\/characters\/agent_one\/emotions\/happy_face-\d{13}-[a-z0-9-]+\.png$/,
    );
    expect(secondPath).toMatch(
      /^\/characters\/agent_one\/emotions\/happy_face-\d{13}-[a-z0-9-]+\.png$/,
    );
    expect(firstPath).not.toBe(secondPath);
    expect(isLocalCharacterAssetPath(firstPath)).toBe(true);
    expect(isLocalCharacterAssetPath(secondPath)).toBe(true);
    expect(mockPutBinaryFile).toHaveBeenNthCalledWith(
      1,
      firstPath,
      expect.any(String),
      'image/png',
    );
    expect(mockPutBinaryFile).toHaveBeenNthCalledWith(
      2,
      secondPath,
      expect.any(String),
      'image/png',
    );
  });

  it.each(supportedUploads)(
    'stores $mimeType $type uploads with .$extension paths',
    async ({ mimeType, extension, type }) => {
      await expect(
        uploadCharacterAsset('agent', 'happy', createFile(mimeType), type),
      ).resolves.toMatch(new RegExp(`\\.${extension}$`));

      expect(mockPutBinaryFile).toHaveBeenLastCalledWith(
        expect.stringMatching(new RegExp(`\\.${extension}$`)),
        expect.any(String),
        mimeType,
      );
    },
  );

  it('preserves explicit video extension mappings', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    await expect(
      uploadCharacterAsset('agent', 'idle', createFile('video/quicktime'), 'video'),
    ).resolves.toMatch(/\.mov$/);
    await expect(
      uploadCharacterAsset('agent', 'idle', createFile('video/ogg'), 'video'),
    ).resolves.toMatch(/\.ogv$/);
  });

  it('rejects empty or invalid path components before storage', async () => {
    await expect(
      uploadCharacterAsset('', 'happy', createFile('image/png'), 'image'),
    ).rejects.toThrow('Invalid characterId');
    await expect(
      uploadCharacterAsset('../', 'happy', createFile('image/png'), 'image'),
    ).rejects.toThrow('Invalid characterId');
    await expect(
      uploadCharacterAsset('agent', '', createFile('image/png'), 'image'),
    ).rejects.toThrow('Invalid emotion');
    await expect(
      uploadCharacterAsset('agent', '...', createFile('image/png'), 'image'),
    ).rejects.toThrow('Invalid emotion');

    expect(mockPutBinaryFile).not.toHaveBeenCalled();
  });

  it('rejects files over the configured type-specific size limits', async () => {
    await expect(
      uploadCharacterAsset(
        'agent',
        'happy',
        createFileWithSize('image/png', 10 * 1024 * 1024 + 1),
        'image',
      ),
    ).rejects.toThrow('Character image asset exceeds');
    await expect(
      uploadCharacterAsset(
        'agent',
        'idle',
        createFileWithSize('video/mp4', MAX_CHARACTER_VIDEO_BYTES + 1),
        'video',
      ),
    ).rejects.toThrow('Character video asset exceeds');

    expect(mockPutBinaryFile).not.toHaveBeenCalled();
  });

  it('sanitizes emotion names for stable upload test ids', () => {
    expect(sanitizeCharacterAssetTestIdPart('Happy Face')).toBe('happy-face');
    expect(sanitizeCharacterAssetTestIdPart(' idle/video ')).toBe('idle-video');
    expect(sanitizeCharacterAssetTestIdPart('...')).toBe('unknown');
  });
});
