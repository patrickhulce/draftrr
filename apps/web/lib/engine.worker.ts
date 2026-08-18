import { runSimulation, type EngineRequest, type SimulationResult } from '@draftrr/core';

export interface WorkerRequest {
  id: number;
  payload: EngineRequest;
}

export interface WorkerResponse {
  id: number;
  result: SimulationResult;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, payload } = event.data;
  const result = runSimulation(payload);
  const response: WorkerResponse = { id, result };
  self.postMessage(response);
};
