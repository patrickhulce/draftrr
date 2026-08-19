import {
  fetchDraft,
  fetchDraftPicks,
  parseDraftId,
  type SleeperDraft,
  type SleeperPick,
} from '@draftrr/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SleeperLinkStatus {
  draftId: string | null;
  draftName: string | null;
  extensionInstalled: boolean;
  sleeperLive: boolean;
}

export function useSleeperBridge(): SleeperLinkStatus & {
  extensionConnected: boolean;
  setDraftId: (id: string | null) => void;
} {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [sleeperLive, setSleeperLive] = useState(false);

  useEffect(() => {
    const win = window as Window & { __draftrrExtension?: boolean };
    if (win.__draftrrExtension || document.documentElement.dataset.draftrrExtension === '1') {
      setExtensionInstalled(true);
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as {
        type?: string;
        draftId?: string | null;
        draftName?: string | null;
        sleeperLive?: boolean;
      };
      if (data?.type !== 'draftrr:status' && data?.type !== 'draftrr:active-draft') return;
      setExtensionInstalled(true);
      document.documentElement.dataset.draftrrStatusAt = String(Date.now());
      if ('draftId' in data) setDraftId(data.draftId ?? null);
      if ('draftName' in data) setDraftName(data.draftName ?? null);
      if (typeof data.sleeperLive === 'boolean') setSleeperLive(data.sleeperLive);
      else if (data.type === 'draftrr:active-draft') setSleeperLive(Boolean(data.draftId));
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'draftrr:hello' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return {
    draftId,
    draftName,
    extensionInstalled,
    sleeperLive,
    extensionConnected: extensionInstalled,
    setDraftId,
  };
}

/** Loads Sleeper picks once, then only on manual refresh or an extension pick ping. */
export function useSleeperPicks(draftId: string | null) {
  const [draft, setDraft] = useState<SleeperDraft | null>(null);
  const [picks, setPicks] = useState<SleeperPick[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const idRef = useRef(draftId);
  idRef.current = draftId;

  const refresh = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    setRefreshing(true);
    try {
      const d = await fetchDraft(id);
      const p = await fetchDraftPicks(id);
      setDraft(d.data);
      setPicks(p.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sleeper refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!draftId) {
      setDraft(null);
      setPicks([]);
      return;
    }
    void refresh();
  }, [draftId, refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { type?: string; draftId?: string; picks?: SleeperPick[] };
      if (data?.type === 'draftrr:picks-payload' && Array.isArray(data.picks)) {
        if (data.draftId && idRef.current && data.draftId !== idRef.current) return;
        setPicks(data.picks);
        setError(null);
        return;
      }
      if (data?.type === 'draftrr:refresh-picks') void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  return { draft, picks, error, refresh, refreshing };
}

export { parseDraftId };
