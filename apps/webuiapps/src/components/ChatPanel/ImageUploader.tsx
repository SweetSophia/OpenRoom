import React, { useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import {
  uploadCharacterAsset,
  getCharacterAssetUrl,
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
      getCharacterAssetUrl(currentUrl).then((url) => {
        if (!cancelled && expectedUrlRef.current === currentUrl && url) {
          setPreviewUrl(url);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [currentUrl]);

  const handleFile = async (file: File) => {
    const isVid = file.type.startsWith('video/') || isVideoAssetUrl(file.name);
    setIsVideo(isVid);
    setUploading(true);
    setError(null);
    try {
      const type = isVid ? 'video' : 'image';
      const path = await uploadCharacterAsset(characterId, emotion, file, type);
      if (expectedUrlRef.current === path || !expectedUrlRef.current) {
        const isVidLocal = file.type.startsWith('video/') || isVideoAssetUrl(path);
        setIsVideo(isVidLocal);
        if (isExternalOrDataUrl(path)) {
          setPreviewUrl(path);
        } else {
          const url = await getCharacterAssetUrl(path);
          setPreviewUrl(url ?? null);
        }
      }
      onUpload(path, type);
    } catch (err) {
      console.warn('Failed to upload asset:', err);
      setError('Upload failed. Check file size/type and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setIsVideo(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemove?.();
  };

  return (
    <div className={styles.assetSlot}>
      <div className={styles.assetSlotHeader}>
        <span className={styles.emotionTag}>{emotion}</span>
      </div>

      {previewUrl ? (
        <div className={styles.assetPreview}>
          {isVideo ? (
            <video src={previewUrl} autoPlay loop muted playsInline className={styles.assetMedia} />
          ) : (
            <img src={previewUrl} alt={emotion} className={styles.assetMedia} />
          )}
          <button className={styles.assetRemoveBtn} onClick={handleRemove} title="Remove">
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
          onClick={() => inputRef.current?.click()}
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
            onChange={(e) => {
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
