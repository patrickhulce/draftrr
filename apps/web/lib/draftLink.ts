import {
  WIRE_MSG,
  isDraftSnapshot,
  isLinkStatus,
  type DraftSnapshot,
  type LinkStatus,
} from '@draftrr/wire';
import { useCallback, useEffect, useState } from 'react';

export function useDraftLink(): {
  installed: boolean;
  status: LinkStatus | null;
  snapshot: DraftSnapshot | null;
  connect: (input: string) => void;
  refresh: () => void;
} {
  const [installed, setInstalled] = useState(false);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);

  useEffect(() => {
    const win = window as Window & { __draftrrExtension?: boolean };
    if (win.__draftrrExtension || document.documentElement.dataset.draftrrExtension === '1') {
      setInstalled(true);
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { type?: string; status?: unknown; snapshot?: unknown };
      if (data?.type === WIRE_MSG.link) {
        setInstalled(true);
        document.documentElement.dataset.draftrrStatusAt = String(Date.now());
        if (isLinkStatus(data.status)) setStatus(data.status);
        return;
      }
      if (data?.type === WIRE_MSG.snapshot && isDraftSnapshot(data.snapshot)) {
        setInstalled(true);
        setSnapshot(data.snapshot);
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: WIRE_MSG.hello }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connect = useCallback((input: string) => {
    window.postMessage({ type: WIRE_MSG.connect, input }, window.location.origin);
  }, []);

  const refresh = useCallback(() => {
    window.postMessage({ type: WIRE_MSG.refresh }, window.location.origin);
  }, []);

  return { installed, status, snapshot, connect, refresh };
}
