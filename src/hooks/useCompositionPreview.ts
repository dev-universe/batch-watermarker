import { useEffect, useRef, useState } from "react";
import type { CompositionRequest } from "../shared/transparentImageTypes";

export function useCompositionPreview(request: CompositionRequest | null, active: boolean) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const currentUrl = useRef("");
  useEffect(() => {
    if (!active || !request) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError("");
    const timeout = window.setTimeout(() => {
      window.transparentImageApi.renderPreview(request).then(data => {
        if (cancelled || !data.length) return;
        const nextUrl = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "image/png" }));
        if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = nextUrl;
        setUrl(nextUrl); setError("");
      }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : String(error)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [request, active]);
  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  return { url, error, loading };
}
