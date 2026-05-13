import React, { useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import {
  uploadCharacterAsset,
  getCharacterAssetUrl,
  deleteCharacterAsset,
  isExternalOrDataUrl,
  isVideoAssetUrl,
} from '@/lib/characterAssetUpload';
import styles from './panel.module.scss';

interface ImageUploaderProps {
  characterId: string;
  emotion: string;
  currentUrl?: string;
  onUpload: (url: string, type: 'image' | 'video') => void;
  onRemove?: () => void;
  accept?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  characterId,
  emotion,
  currentUrl,
  onUpload,
  onRemove,
  accept = 'image/*,video/*',
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expectedUrlRef = useRef<string | undefined>(undefined);
  const uploadSequenceRef = useRef(0);

  useEffect(() => {
    return () => {
      uploadSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    expectedUrlRef.current = currentUrl;

    if (!currentUrl) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const isVid = isVideoAssetUrl(currentUrl);
    setIsVideo(isVid);

    if (isExternalOrDataUrl(currentUrl)) {
      setPreviewUrl(currentUrl);
    } else {
      const url = getCharacterAssetUrl(currentUrl);
      if (!cancelled && expectedUrlRef.current === currentUrl) {
        setPreviewUrl(url ?? null);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [currentUrl]);

  const handleFile = async (file: File) => {
    const uploadSequence = (uploadSequenceRef.current += 1);
    const isCurrentUpload = () => uploadSequenceRef.current === uploadSequence;
    const cleanupStaleUpload = async (path: string) => {
      try {
        await deleteCharacterAsset(path);
      } catch (err) {
        console.warn('Failed to clean up stale uploaded asset:', err);
      }
    };

    const isVid = file.type.startsWith('video/') || isVideoAssetUrl(file.name);
    setIsVideo(isVid);
    setUploading(true);
    setError(null);
    try {
      const type = isVid ? 'video' : 'image';
      const path = await uploadCharacterAsset(characterId, emotion, file, type);
      if (!isCurrentUpload()) {
        await cleanupStaleUpload(path);
        return;
      }

      if (expectedUrlRef.current === path || !expectedUrlRef.current) {
        const isVidLocal = file.type.startsWith('video/') || isVideoAssetUrl(path);
        setIsVideo(isVidLocal);
        if (isExternalOrDataUrl(path)) {
          setPreviewUrl(path);
        } else {
          const url = getCharacterAssetUrl(path);
          if (!isCurrentUpload()) {
            await cleanupStaleUpload(path);
            return;
          }
          setPreviewUrl(url ?? null);
        }
      }
      if (!isCurrentUpload()) {
        await cleanupStaleUpload(path);
        return;
      }
      onUpload(path, type);
    } catch (err) {
      if (!isCurrentUpload()) return;
      console.warn('Failed to upload asset:', err);
      setError('Upload failed. Check file size/type and try again.');
    } finally {
      if (isCurrentUpload()) setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    uploadSequenceRef.current += 1;
    setPreviewUrl(null);
    setUploading(false);
    setIsVideo(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemove?.();
  };

  const handlePreviewError = () => {
    setError('Preview failed to load. Check the asset and try again.');
  };

  return (
    <div className={styles.assetSlot} aria-busy={uploading}>
      <div className={styles.assetSlotHeader}>
        <span className={styles.emotionTag}>{emotion}</span>
      </div>

      {previewUrl ? (
        <div className={styles.assetPreview}>
          {isVideo ? (
            <video
              src={previewUrl}
              autoPlay
              loop
              muted
              playsInline
              className={styles.assetMedia}
              onError={handlePreviewError}
            />
          ) : (
            <img
              src={previewUrl}
              alt={emotion}
              className={styles.assetMedia}
              onError={handlePreviewError}
            />
          )}
          <button
            className={styles.assetRemoveBtn}
            onClick={handleRemove}
            title="Remove"
            disabled={uploading}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          className={`${styles.assetDropzone} ${dragover ? styles.assetDropzoneActive : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragover(true);
          }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          aria-busy={uploading}
          onClick={() => {
            if (!uploading) inputRef.current?.click();
          }}
        >
          {uploading ? (
            <span className={styles.assetUploading}>Uploading...</span>
          ) : (
            <>
              <Upload size={16} className={styles.assetDropzoneIcon} />
              <span className={styles.assetDropzoneText}>Drop or click</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className={styles.assetHiddenInput}
            disabled={uploading}
            onChange={(e) => {
              if (uploading) return;
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}
      {error && <div className={styles.assetError}>{error}</div>}
    </div>
  );
};

export default ImageUploader;
