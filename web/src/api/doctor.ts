import api from './client';

export interface AgentProbe {
  agent: string;
  installed: boolean;
  error?: string;
  display_name?: string;
  binary?: string;
  path?: string;
  version?: string;
}

/** Probe every registered agent's CLI binary (see /api/v1/doctor/agents). */
export function probeAgents(): Promise<{ agents: AgentProbe[] }> {
  return api.get('/doctor/agents');
}
