/**
 * Helper sub-components extracted from ChatPanel
 *
 * StageIndicator, ActionsTaken, CharacterAvatar, renderMessageContent
 */

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CharacterConfig } from '@/lib/characterManager';
import { resolveEmotionMedia } from '@/lib/characterManager';
import { getCharacterAssetUrl, isExternalOrDataUrl } from '@/lib/characterAssetUpload';
import type { ModManager } from '@/lib/modManager';
import styles from './index.module.scss';

// ---------------------------------------------------------------------------
// Render message content — formats (action text) as styled spans
// ---------------------------------------------------------------------------

export function renderMessageContent(content: string): React.ReactNode {
  const parts = content.split(/(\([^)]+\))/g);
  return parts.map((part, i) => {
    if (/^\([^)]+\)$/.test(part)) {
      return (
        <span key={i} className={styles.emotion}>
          {part}
        </span>
      );
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Stage Indicator
// ---------------------------------------------------------------------------

export const StageIndicator: React.FC<{ modManager: ModManager | null }> = ({ modManager }) => {
  if (!modManager) return null;

  const total = modManager.stageCount;
  const current = modManager.currentStageIndex;
  const finished = modManager.isFinished;

  return (
    <div className={styles.stageIndicator}>
      <span className={styles.stageText}>
        Stage {finished ? total : current + 1}/{total}
      </span>
      <div className={styles.stageDots}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`${styles.stageDot} ${
              i < current || finished
                ? styles.stageDotCompleted
                : i === current
                  ? styles.stageDotCurrent
                  : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Actions Taken (collapsible)
// ---------------------------------------------------------------------------

export const ActionsTaken: React.FC<{ calls: string[] }> = ({ calls }) => {
  const [open, setOpen] = useState(false);
  if (calls.length === 0) return null;

  return (
    <div className={styles.actionsTaken}>
      <button className={styles.actionsTakenToggle} onClick={() => setOpen(!open)}>
        Actions taken
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className={styles.actionsTakenList}>
          {calls.map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CharacterAvatar – crossfade between emotion media without flashing
// ---------------------------------------------------------------------------

interface AvatarLayer {
  url: string;
  type: 'video' | 'image';
  active: boolean;
}

export const CharacterAvatar: React.FC<{
  character: CharacterConfig;
  emotion?: string;
  onEmotionEnd: () => void;
}> = memo(({ character, emotion, onEmotionEnd }) => {
  const isIdle = !emotion;
  const media = resolveEmotionMedia(character, emotion || 'default');

  const [layers, setLayers] = useState<AvatarLayer[]>(() =>
    media ? [{ url: media.url, type: media.type, active: true }] : [],
  );
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const activeUrl = layers.find((l) => l.active)?.url;
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) clearTimeout(cleanupRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const resolveAll = async () => {
      const resolved: Record<string, string> = {};
      for (const layer of layers) {
        if (isExternalOrDataUrl(layer.url)) {
          resolved[layer.url] = layer.url;
        } else {
          const resolvedUrl = await Promise.resolve(getCharacterAssetUrl(layer.url));
          if (resolvedUrl) resolved[layer.url] = resolvedUrl;
        }
      }
      if (mounted) setResolvedUrls(resolved);
    };
    resolveAll();
    return () => {
      mounted = false;
    };
  }, [layers.map((l) => l.url).join(',')]);

  useEffect(() => {
    if (!media) {
      setLayers([]);
      return;
    }
    if (failedUrls.has(media.url)) return;
    if (media.url === activeUrl) return;
    setLayers((prev) => {
      // If the URL already exists (possibly inactive), reactivate it
      const existing = prev.find((l) => l.url === media.url);
      if (existing) {
        // Cancel any pending cleanup that might remove this layer
        if (cleanupRef.current) {
          clearTimeout(cleanupRef.current);
          cleanupRef.current = null;
        }
        return prev.map((l) => ({
          ...l,
          active: l.url === media.url,
        }));
      }
      return [...prev, { url: media.url, type: media.type, active: false }];
    });
  }, [media?.url, activeUrl, failedUrls]);

  const handleMediaReady = useCallback((readyUrl: string) => {
    setLayers((prev) => {
      const staleUrls = prev.filter((l) => l.url !== readyUrl).map((l) => l.url);
      if (cleanupRef.current) clearTimeout(cleanupRef.current);
      cleanupRef.current = setTimeout(() => {
        setLayers((curr) => curr.filter((l) => !staleUrls.includes(l.url)));
      }, 300);
      return prev.map((l) => ({ ...l, active: l.url === readyUrl }));
    });
  }, []);

  const handleMediaError = useCallback((failedUrl: string) => {
    setFailedUrls((current) => new Set(current).add(failedUrl));
    setResolvedUrls((current) => {
      const next = { ...current };
      delete next[failedUrl];
      return next;
    });
    setLayers((prev) => {
      const remaining = prev.filter((l) => l.url !== failedUrl);
      if (remaining.some((l) => l.active)) return remaining;
      const fallback = remaining[remaining.length - 1];
      return remaining.map((l) => ({ ...l, active: l.url === fallback?.url }));
    });
  }, []);

  const renderableLayers = layers
    .filter((layer) => !failedUrls.has(layer.url))
    .map((layer) => ({
      layer,
      src: resolvedUrls[layer.url] ?? (isExternalOrDataUrl(layer.url) ? layer.url : undefined),
    }))
    .filter((item): item is { layer: AvatarLayer; src: string } => !!item.src);

  const hasActiveRenderableLayer = renderableLayers.some(({ layer }) => layer.active);

  if (renderableLayers.length === 0) {
    return <div className={styles.avatarPlaceholder}>{character.character_name.charAt(0)}</div>;
  }

  return (
    <>
      {renderableLayers.map(({ layer, src }, index) => {
        const isVisible =
          layer.active || (!hasActiveRenderableLayer && index === renderableLayers.length - 1);
        const layerStyle: React.CSSProperties = {
          position: 'absolute',
          inset: 0,
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.25s ease-out',
        };
        if (layer.type === 'video') {
          return (
            <video
              key={layer.url}
              className={styles.avatarImage}
              style={layerStyle}
              src={src}
              autoPlay
              loop={layer.active ? isIdle : false}
              muted
              playsInline
              onCanPlay={!layer.active ? () => handleMediaReady(layer.url) : undefined}
              onEnded={layer.active && !isIdle ? onEmotionEnd : undefined}
              onError={() => handleMediaError(layer.url)}
            />
          );
        }
        return (
          <img
            key={layer.url}
            className={styles.avatarImage}
            style={layerStyle}
            src={src}
            alt={character.character_name}
            onLoad={!layer.active ? () => handleMediaReady(layer.url) : undefined}
            onError={() => handleMediaError(layer.url)}
          />
        );
      })}
    </>
  );
});
