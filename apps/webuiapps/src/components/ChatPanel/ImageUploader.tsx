import React, { useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadCharacterAsset, getCharacterAssetUrl } from '@/lib/characterAssetUpload';
import styles from './panel.module.scss';

const VIDEO_REGEX = /\.(mp4|webm|mov|ogg)(\?|$)/i;

interface ImageUploaderProps {
  characterId: string;
  emotion: string;
  currentUrl?: string;
  onUpload: (url: string) => void;
  onRemove?: () => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  characterId,
  emotion,
  currentUrl,
  onUpload,
  onRemove,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [isVideo, setIsVideo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUrl) {
      resolvePreviewUrl(currentUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [currentUrl]);

  const resolvePreviewUrl = async (path: string) => {
    const isVid = VIDEO_REGEX.test(path);
    setIsVideo(isVid);
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      setPreviewUrl(path);
    } else {
      const url = await getCharacterAssetUrl(path);
      setPreviewUrl(url);
    }
  };

  const handleFile = async (file: File) => {
    const isVid = VIDEO_REGEX.test(file.name) || file.type.startsWith('video/');
    setIsVideo(isVid);
    setUploading(true);
    try {
      const type = isVid ? 'video' : 'image';
      const path = await uploadCharacterAsset(characterId, emotion, file, type);
      await resolvePreviewUrl(path);
      onUpload(path);
    } catch (err) {
      console.warn('Upload failed:', err);
      console.error('Failed to upload asset:', err);
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
            accept="image/*,video/*"
            className={styles.assetHiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
