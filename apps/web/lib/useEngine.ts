'use client';

import {
  DEFAULT_SIMS,
  runSimulation,
  type EngineRequest,
  type SimulationResult,
} from '@draftrr/core';
import { useEffect, useRef, useState } from 'react';

function availabilityKey(req: EngineRequest): string {
  return JSON.stringify({
    pickedPlayerIds: req.pickedPlayerIds,
    rankingPlayerIds: req.rankingPlayerIds,
    mySlot: req.mySlot,
    settings: req.settings,
    sims: req.sims,
    seed: req.seed,
  });
}

export function useEngine(request: EngineRequest | null) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const requestRef = useRef(request);
  const startedKeyRef = useRef('');
  requestRef.current = request;
  const key = request ? availabilityKey(request) : '';

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./engine.worker.ts', import.meta.url));
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ id: number; result: SimulationResult }>) => {
        if (event.data.id === idRef.current) {
          setResult(event.data.result);
          setRunning(false);
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

  useEffect(() => {
    if (!key) return;
    if (key === startedKeyRef.current) return;
    const handle = window.setTimeout(() => {
      const req = requestRef.current;
      if (!req || key === startedKeyRef.current) return;
      startedKeyRef.current = key;
      const id = ++idRef.current;
      const payload = { ...req, sims: req.sims || DEFAULT_SIMS };
      setRunning(true);
      if (workerRef.current) {
        workerRef.current.postMessage({ id, payload });
        return;
      }
      setResult(runSimulation(payload));
      setRunning(false);
    }, 80);
    return () => window.clearTimeout(handle);
  }, [key]);

  return { result, running };
}
