'use client';

import { runAnalysis, type AnalysisRequest, type AnalysisResult } from '@draftrr/core';
import { useCallback, useEffect, useRef, useState } from 'react';

type AnalysisWorkerEvent =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; kind: 'analysis'; result: AnalysisResult };

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./engine.worker.ts', import.meta.url));
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<AnalysisWorkerEvent>) => {
        const data = event.data;
        if (data.id !== idRef.current) return;
        if (data.type === 'progress') {
          setProgress({ done: data.done, total: data.total });
          return;
        }
        if (data.type === 'result' && data.kind === 'analysis') {
          setResult(data.result);
          setRunning(false);
          setProgress(null);
        }
      };
      worker.onerror = () => {
        workerRef.current?.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((req: AnalysisRequest) => {
    const id = ++idRef.current;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: req.outerSims });
    if (workerRef.current) {
      workerRef.current.postMessage({ id, kind: 'analysis', payload: req });
      return;
    }
    const next = runAnalysis(req, (done, total) => setProgress({ done, total }));
    setResult(next);
    setRunning(false);
    setProgress(null);
  }, []);

  return { result, running, progress, run, setResult };
}
