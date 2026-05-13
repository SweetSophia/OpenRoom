import { useState, useEffect } from 'react';
import { getCharacterAssetUrl, isExternalOrDataUrl } from '@/lib/characterAssetUpload';

export function useResolvedAssetUrl(url: string | undefined): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() =>
    url && isExternalOrDataUrl(url) ? url : undefined,
  );

  useEffect(() => {
    if (!url) {
      setResolvedUrl(undefined);
      return;
    }

    if (isExternalOrDataUrl(url)) {
      setResolvedUrl(url);
      return;
    }

    let mounted = true;
    setResolvedUrl(undefined);
    Promise.resolve(getCharacterAssetUrl(url)).then((resolved) => {
      if (mounted) {
        setResolvedUrl(resolved);
      }
    });

    return () => {
      mounted = false;
    };
  }, [url]);

  return resolvedUrl;
}
