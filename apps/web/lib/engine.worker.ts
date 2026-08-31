import {
  runAnalysis,
  runSimulation,
  type AnalysisRequest,
  type AnalysisResult,
  type EngineRequest,
  type SimulationResult,
} from '@draftrr/core';

export type WorkerRequest =
  | { id: number; kind?: 'simulation'; payload: EngineRequest }
  | { id: number; kind: 'analysis'; payload: AnalysisRequest };

export type WorkerResponse =
  | { id: number; result: SimulationResult }
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; kind: 'analysis'; result: AnalysisResult };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (data.kind === 'analysis') {
    const result = runAnalysis(data.payload, (done, total) => {
      const progress: WorkerResponse = { id: data.id, type: 'progress', done, total };
      self.postMessage(progress);
    });
    const response: WorkerResponse = { id: data.id, type: 'result', kind: 'analysis', result };
    self.postMessage(response);
    return;
  }
  const result = runSimulation(data.payload);
  const response: WorkerResponse = { id: data.id, result };
  self.postMessage(response);
};
