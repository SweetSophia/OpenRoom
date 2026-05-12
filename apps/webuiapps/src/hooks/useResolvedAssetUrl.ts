import { useState, useEffect } from 'react';
import { getCharacterAssetUrl } from '@/lib/characterAssetUpload';

export function useResolvedAssetUrl(url: string | undefined): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(url);

  useEffect(() => {
    if (!url) {
      setResolvedUrl(undefined);
      return;
    }

    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      setResolvedUrl(url);
      return;
    }

    let mounted = true;
    getCharacterAssetUrl(url).then((resolved) => {
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
