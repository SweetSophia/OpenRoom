import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diskStorage', () => ({
  putBinaryFile: vi.fn().mockResolvedValue(undefined),
  getBinaryFile: vi.fn().mockResolvedValue(null),
  deleteFilesByPaths: vi.fn().mockResolvedValue(undefined),
}));

import {
  getCharacterAssetKind,
  getCharacterAssetUrl,
  isLocalCharacterAssetPath,
  uploadCharacterAsset,
  deleteCharacterAsset,
} from '../characterAssetUpload';
import { deleteFilesByPaths, getBinaryFile, putBinaryFile } from '../diskStorage';

const mockPutBinaryFile = vi.mocked(putBinaryFile);
const mockGetBinaryFile = vi.mocked(getBinaryFile);
const mockDeleteFilesByPaths = vi.mocked(deleteFilesByPaths);

function createFile(type: string, size = 4): File {
  return new File(['x'.repeat(size)], 'asset', { type });
}

describe('characterAssetUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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
    await expect(getCharacterAssetUrl(unsafePath)).resolves.toBeUndefined();

    expect(mockDeleteFilesByPaths).not.toHaveBeenCalled();
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
    vi.spyOn(Date, 'now').mockReturnValueOnce(1700000000001).mockReturnValueOnce(1700000000002);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.123456789).mockReturnValueOnce(0.987654321);

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
      /^\/characters\/agent_one\/emotions\/happy_face-\d{13}-[a-z0-9]+\.png$/,
    );
    expect(secondPath).toMatch(
      /^\/characters\/agent_one\/emotions\/happy_face-\d{13}-[a-z0-9]+\.png$/,
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

  it('preserves explicit video extension mappings', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

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
        createFile('image/png', 10 * 1024 * 1024 + 1),
        'image',
      ),
    ).rejects.toThrow('Character image asset exceeds');
    await expect(
      uploadCharacterAsset('agent', 'idle', createFile('video/mp4', 50 * 1024 * 1024 + 1), 'video'),
    ).rejects.toThrow('Character video asset exceeds');

    expect(mockPutBinaryFile).not.toHaveBeenCalled();
  });
});
