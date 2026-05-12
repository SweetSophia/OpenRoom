import React, { useState } from 'react';
import { X, Plus, Trash2, Check } from 'lucide-react';
import {
  type CharacterConfig,
  type CharacterCollection,
  CHARACTER_EMOTION_LIST,
  generateCharacterId,
  getCharacterList,
} from '@/lib/characterManager';
import {
  deleteCharacterAsset,
  isLocalCharacterAssetPath,
  isVideoAssetUrl,
} from '@/lib/characterAssetUpload';
import { useResolvedAssetUrl } from '@/hooks/useResolvedAssetUrl';
import ImageUploader from './ImageUploader';
import styles from './panel.module.scss';

const CharacterAvatarThumb: React.FC<{ url?: string; name: string }> = ({ url, name }) => {
  const resolvedUrl = useResolvedAssetUrl(url);
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!resolvedUrl || failedUrl === resolvedUrl) return <span>{name.charAt(0)}</span>;
  return <img src={resolvedUrl} alt={name} onError={() => setFailedUrl(resolvedUrl)} />;
};

const CharacterImagePreview: React.FC<{ url: string; name: string }> = ({ url, name }) => {
  const resolvedUrl = useResolvedAssetUrl(url);
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!resolvedUrl || failedUrl === resolvedUrl) return null;
  return (
    <img
      src={resolvedUrl}
      alt={name}
      className={styles.avatarImg}
      onError={() => setFailedUrl(resolvedUrl)}
    />
  );
};

const EmotionAssetPreview: React.FC<{ url?: string; emotion: string }> = ({ url, emotion }) => {
  const resolvedUrl = useResolvedAssetUrl(url);
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!url || !resolvedUrl || failedUrl === resolvedUrl) return null;
  return isVideoAssetUrl(url) ? (
    <video
      src={resolvedUrl}
      className={styles.emotionThumb}
      autoPlay
      loop
      muted
      playsInline
      onError={() => setFailedUrl(resolvedUrl)}
    />
  ) : (
    <img
      src={resolvedUrl}
      alt={emotion}
      className={styles.emotionThumb}
      onError={() => setFailedUrl(resolvedUrl)}
    />
  );
};

interface CharacterPanelProps {
  collection: CharacterCollection;
  onSave: (collection: CharacterCollection) => void;
  onClose: () => void;
}

interface CharacterAssetLifecycle {
  createdAssets: string[];
  deleteOnCommit: string[];
}

function collectCharacterLocalAssetPaths(character?: CharacterConfig): Set<string> {
  const paths = new Set<string>();
  const addPath = (path?: string) => {
    const trimmed = path?.trim();
    if (trimmed && isLocalCharacterAssetPath(trimmed)) paths.add(trimmed);
  };

  addPath(character?.character_meta_info?.base_image_url);
  for (const path of Object.values(character?.character_meta_info?.emotion_images ?? {})) {
    addPath(path);
  }
  for (const pathsForEmotion of Object.values(
    character?.character_meta_info?.emotion_videos ?? {},
  )) {
    for (const path of pathsForEmotion ?? []) addPath(path);
  }

  return paths;
}

function collectCollectionLocalAssetPaths(collection: CharacterCollection): Set<string> {
  const paths = new Set<string>();
  for (const character of Object.values(collection.items)) {
    for (const path of collectCharacterLocalAssetPaths(character)) paths.add(path);
  }
  return paths;
}

function diffLocalAssetPaths(
  oldCharacter: CharacterConfig,
  newCharacter: CharacterConfig,
): string[] {
  const oldPaths = collectCharacterLocalAssetPaths(oldCharacter);
  const newPaths = collectCharacterLocalAssetPaths(newCharacter);
  return [...oldPaths].filter((path) => !newPaths.has(path));
}

async function deleteAssetPaths(paths: Iterable<string>): Promise<void> {
  for (const path of new Set(paths)) {
    try {
      await deleteCharacterAsset(path);
    } catch (err) {
      console.warn('Failed to delete character asset:', err);
    }
  }
}

const CharacterPanel: React.FC<CharacterPanelProps> = ({ collection, onSave, onClose }) => {
  const [col, setCol] = useState<CharacterCollection>(() => ({ ...collection }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sessionCreatedAssets, setSessionCreatedAssets] = useState<Set<string>>(() => new Set());
  const [pendingDeleteAssets, setPendingDeleteAssets] = useState<Set<string>>(() => new Set());

  const characters = getCharacterList(col);
  const activeId = col.activeId;
  const editing = editingId ? col.items[editingId] : null;

  const handleSelect = (id: string) => {
    setCol({ ...col, activeId: id });
  };

  const handleDelete = (id: string) => {
    if (characters.length <= 1) return;
    const deletedCharacter = col.items[id];
    const items = { ...col.items };
    delete items[id];
    const newActiveId = col.activeId === id ? Object.keys(items)[0] : col.activeId;
    setCol({ activeId: newActiveId, items });
    if (deletedCharacter) {
      setPendingDeleteAssets((current) => {
        const next = new Set(current);
        for (const path of collectCharacterLocalAssetPaths(deletedCharacter)) next.add(path);
        return next;
      });
    }
    if (editingId === id) setEditingId(null);
  };

  const handleAdd = () => {
    const id = generateCharacterId();
    const newChar: CharacterConfig = {
      id,
      character_name: 'New Character',
      character_gender_desc: '',
      character_desc: '',
      character_emotion_list: [...CHARACTER_EMOTION_LIST],
      character_meta_info: { base_image_url: '' },
    };
    setCol({ ...col, items: { ...col.items, [id]: newChar } });
    setEditingId(id);
  };

  const handleSave = () => {
    onSave(col);
    const referencedPaths = collectCollectionLocalAssetPaths(col);
    const stagedDeletes = new Set(
      [...pendingDeleteAssets].filter((path) => !referencedPaths.has(path)),
    );
    for (const path of sessionCreatedAssets) {
      if (!referencedPaths.has(path)) stagedDeletes.add(path);
    }
    void deleteAssetPaths(stagedDeletes);
  };

  const handleCancel = () => {
    const originallyReferencedPaths = collectCollectionLocalAssetPaths(collection);
    const createdOnlyInSession = [...sessionCreatedAssets].filter(
      (path) => !originallyReferencedPaths.has(path),
    );
    void deleteAssetPaths(createdOnlyInSession);
    onClose();
  };

  if (editing) {
    return (
      <CharacterEditor
        character={editing}
        onSave={(updated, lifecycle) => {
          setCol({ ...col, items: { ...col.items, [updated.id]: updated } });
          setSessionCreatedAssets((current) => new Set([...current, ...lifecycle.createdAssets]));
          setPendingDeleteAssets((current) => new Set([...current, ...lifecycle.deleteOnCommit]));
          setEditingId(null);
        }}
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Characters</span>
          <button className={styles.closeBtn} onClick={handleCancel}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.listView}>
            {characters.map((char) => (
              <div
                key={char.id}
                className={`${styles.listItem} ${char.id === activeId ? styles.listItemActive : ''}`}
                onClick={() => handleSelect(char.id)}
              >
                <div className={styles.listItemAvatar}>
                  <CharacterAvatarThumb
                    url={char.character_meta_info?.base_image_url}
                    name={char.character_name}
                  />
                </div>
                <div className={styles.listItemInfo}>
                  <div className={styles.listItemName}>{char.character_name}</div>
                  <div className={styles.listItemDesc}>
                    {char.character_gender_desc || 'No gender set'}
                  </div>
                </div>
                <div className={styles.listItemActions}>
                  {char.id === activeId && (
                    <span className={styles.activeBadge}>
                      <Check size={12} />
                    </span>
                  )}
                  <button
                    className={styles.listItemBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(char.id);
                    }}
                    title="Edit"
                  >
                    Edit
                  </button>
                  {characters.length > 1 && (
                    <button
                      className={styles.listItemBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(char.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panelFooter}>
          <button className={styles.addBtn} onClick={handleAdd}>
            <Plus size={14} /> New Character
          </button>
          <div style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={handleCancel}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Character Editor (single character editing form)
// ---------------------------------------------------------------------------

const CharacterEditor: React.FC<{
  character: CharacterConfig;
  onSave: (config: CharacterConfig, lifecycle: CharacterAssetLifecycle) => void;
  onClose: () => void;
}> = ({ character, onSave, onClose }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'assets'>('details');
  const [name, setName] = useState(character.character_name);
  const [gender, setGender] = useState(character.character_gender_desc);
  const [desc, setDesc] = useState(character.character_desc);
  const [imageUrl, setImageUrl] = useState(character.character_meta_info?.base_image_url || '');
  const [emotions, setEmotions] = useState<string[]>([...character.character_emotion_list]);
  const [emotionImages, setEmotionImages] = useState<Record<string, string>>(() => ({
    ...character.character_meta_info?.emotion_images,
  }));
  const [emotionVideos, setEmotionVideos] = useState<Record<string, string[]>>(() => ({
    ...character.character_meta_info?.emotion_videos,
  }));
  const [newEmotion, setNewEmotion] = useState('');
  const [createdAssets, setCreatedAssets] = useState<Set<string>>(() => new Set());
  const [deleteOnCommit, setDeleteOnCommit] = useState<Set<string>>(() => new Set());

  const markUploadedAsset = (url: string) => {
    if (!isLocalCharacterAssetPath(url)) return;
    setCreatedAssets((current) => new Set(current).add(url));
  };

  const markRemovedAsset = (url?: string) => {
    const trimmedUrl = url?.trim();
    if (!trimmedUrl || !isLocalCharacterAssetPath(trimmedUrl)) return;
    setDeleteOnCommit((current) => new Set(current).add(trimmedUrl));
  };

  const handleAddEmotion = () => {
    const e = newEmotion.trim().toLowerCase();
    if (e && !emotions.includes(e)) {
      setEmotions([...emotions, e]);
      setNewEmotion('');
    }
  };

  const getEmotionAssetUrl = (emotion: string) =>
    emotionVideos[emotion]?.[0] || emotionImages[emotion];

  const handleEmotionAssetUpload = (emotion: string, url: string, type: 'image' | 'video') => {
    const previousUrl = getEmotionAssetUrl(emotion);
    if (previousUrl !== url) markRemovedAsset(previousUrl);
    markUploadedAsset(url);

    if (type === 'video') {
      setEmotionVideos({ ...emotionVideos, [emotion]: [url] });
      const updatedImages = { ...emotionImages };
      delete updatedImages[emotion];
      setEmotionImages(updatedImages);
      return;
    }

    setEmotionImages({ ...emotionImages, [emotion]: url });
    const updatedVideos = { ...emotionVideos };
    delete updatedVideos[emotion];
    setEmotionVideos(updatedVideos);
  };

  const handleEmotionAssetRemove = (emotion: string) => {
    markRemovedAsset(getEmotionAssetUrl(emotion));
    const updatedImages = { ...emotionImages };
    delete updatedImages[emotion];
    setEmotionImages(updatedImages);
    const updatedVideos = { ...emotionVideos };
    delete updatedVideos[emotion];
    setEmotionVideos(updatedVideos);
  };

  const handleRemoveEmotion = (emotion: string) => {
    markRemovedAsset(getEmotionAssetUrl(emotion));
    setEmotions(emotions.filter((e) => e !== emotion));
    const updatedImages = { ...emotionImages };
    delete updatedImages[emotion];
    setEmotionImages(updatedImages);
    const updatedVideos = { ...emotionVideos };
    delete updatedVideos[emotion];
    setEmotionVideos(updatedVideos);
  };

  const handleResetEmotions = () => {
    setEmotions([...CHARACTER_EMOTION_LIST]);
  };

  const updateEmotionAssetUrl = (emotion: string, url: string) => {
    const trimmedUrl = url.trim();
    const updatedImages = { ...emotionImages };
    const updatedVideos = { ...emotionVideos };

    delete updatedImages[emotion];
    delete updatedVideos[emotion];

    if (trimmedUrl) {
      if (isVideoAssetUrl(trimmedUrl)) {
        updatedVideos[emotion] = [trimmedUrl];
      } else {
        updatedImages[emotion] = trimmedUrl;
      }
    }

    const previousUrl = getEmotionAssetUrl(emotion);
    if (previousUrl !== trimmedUrl) markRemovedAsset(previousUrl);

    setEmotionImages(updatedImages);
    setEmotionVideos(updatedVideos);
  };

  const handleBaseImageUpload = (url: string) => {
    if (imageUrl !== url) markRemovedAsset(imageUrl);
    markUploadedAsset(url);
    setImageUrl(url);
  };

  const handleBaseImageRemove = () => {
    markRemovedAsset(imageUrl);
    setImageUrl('');
  };

  const handleSave = () => {
    const cleanImages: Record<string, string> = {};
    for (const [k, v] of Object.entries(emotionImages)) {
      if (v?.trim()) cleanImages[k] = v.trim();
    }

    const cleanVideos: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(emotionVideos)) {
      if (v?.length) cleanVideos[k] = v;
    }

    const updatedCharacter: CharacterConfig = {
      id: character.id,
      character_name: name.trim() || 'Unnamed',
      character_gender_desc: gender.trim(),
      character_desc: desc.trim(),
      character_emotion_list: emotions,
      character_meta_info: {
        ...character.character_meta_info,
        base_image_url: imageUrl.trim() || undefined,
        emotion_images: Object.keys(cleanImages).length > 0 ? cleanImages : undefined,
        emotion_videos: Object.keys(cleanVideos).length > 0 ? cleanVideos : undefined,
      },
    };

    const referencedPaths = collectCharacterLocalAssetPaths(updatedCharacter);
    const staleAssets = [
      ...new Set([...deleteOnCommit, ...diffLocalAssetPaths(character, updatedCharacter)]),
    ].filter((path) => !referencedPaths.has(path));

    onSave(updatedCharacter, {
      createdAssets: [...createdAssets],
      deleteOnCommit: staleAssets,
    });
  };

  const handleClose = () => {
    void deleteAssetPaths(createdAssets);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Edit Character</span>
          <button className={styles.closeBtn} onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'details' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'assets' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('assets')}
            >
              Assets
            </button>
          </div>

          {activeTab === 'details' && (
            <>
              {imageUrl && (
                <div className={styles.avatarPreview}>
                  <CharacterImagePreview url={imageUrl} name={name} />
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <input
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Character name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Gender</label>
                <input
                  className={styles.input}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  placeholder="female / male / non-binary / ..."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Persona Description</label>
                <textarea
                  className={styles.textarea}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={6}
                  placeholder="Describe the character's personality, background, speaking style..."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Default Avatar (base image)</label>
                <input
                  className={styles.input}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://... or upload below"
                />
                <div style={{ marginTop: 8 }}>
                  <ImageUploader
                    characterId={character.id}
                    emotion="avatar"
                    currentUrl={imageUrl}
                    accept="image/*"
                    onUpload={(url, type) => {
                      if (type === 'image') handleBaseImageUpload(url);
                    }}
                    onRemove={handleBaseImageRemove}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>
                  Emotions & Expressions
                  <button className={styles.resetLink} onClick={handleResetEmotions}>
                    Reset to defaults
                  </button>
                </label>
                <div className={styles.emotionImageList}>
                  {emotions.map((e) => (
                    <div key={e} className={styles.emotionImageRow}>
                      <div className={styles.emotionImageHeader}>
                        <span className={styles.emotionTag}>
                          {e}
                          <button
                            className={styles.emotionRemove}
                            onClick={() => handleRemoveEmotion(e)}
                          >
                            <Trash2 size={10} />
                          </button>
                        </span>
                        <EmotionAssetPreview url={getEmotionAssetUrl(e)} emotion={e} />
                      </div>
                      <input
                        className={styles.input}
                        value={getEmotionAssetUrl(e) || ''}
                        onChange={(ev) => updateEmotionAssetUrl(e, ev.target.value)}
                        placeholder={`Image/Video URL for "${e}" (optional)`}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.emotionAdd}>
                  <input
                    className={styles.input}
                    value={newEmotion}
                    onChange={(e) => setNewEmotion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmotion()}
                    placeholder="Add emotion..."
                  />
                  <button className={styles.addBtn} onClick={handleAddEmotion}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'assets' && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Emotion Assets</label>
                <div className={styles.assetGrid}>
                  {emotions.map((e) => (
                    <ImageUploader
                      key={e}
                      characterId={character.id}
                      emotion={e}
                      currentUrl={getEmotionAssetUrl(e)}
                      onUpload={(url, type) => handleEmotionAssetUpload(e, url, type)}
                      onRemove={() => handleEmotionAssetRemove(e)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.panelFooter}>
          <button className={styles.cancelBtn} onClick={handleClose}>
            Back
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterPanel;
