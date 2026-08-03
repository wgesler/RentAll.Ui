export interface AgentRequest {
  agentId?: string;
  organizationId: string;
  officeId?: number | null;
  offices: number[];
  agentCode: string;
  name: string;
  isActive: boolean;
}

export interface AgentResponse {
  agentId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  offices: number[];
  agentCode: string;
  name: string;
  isActive: boolean;
}

export interface AgentListDisplay {
  agentId: string;
  agentCode: string;
  officeId: number;
  officeName: string;
  offices: number[];
  name: string;
  isActive: boolean;
}

export function normalizeAgentOffices(
  offices: number[] | null | undefined,
  primaryOfficeId?: number | null
): number[] {
  const normalized = (offices || [])
    .map(id => Number(id))
    .filter(id => Number.isFinite(id) && id > 0);
  const unique = Array.from(new Set(normalized));
  const primaryOffice = Number(primaryOfficeId);
  if (Number.isFinite(primaryOffice) && primaryOffice > 0 && !unique.includes(primaryOffice)) {
    unique.unshift(primaryOffice);
  }
  if (unique.length === 0 && Number.isFinite(primaryOffice) && primaryOffice > 0) {
    return [primaryOffice];
  }
  return unique;
}

export function agentHasOfficeAccess(
  agent: Pick<AgentResponse, 'officeId' | 'offices'> | null | undefined,
  officeId: number | null | undefined
): boolean {
  const parsedOfficeId = Number(officeId);
  if (!Number.isFinite(parsedOfficeId) || parsedOfficeId <= 0) {
    return true;
  }
  const agentOffices = normalizeAgentOffices(agent?.offices, agent?.officeId);
  return agentOffices.includes(parsedOfficeId);
}

export function filterAgentsByOffice<T extends Pick<AgentResponse, 'officeId' | 'offices' | 'isActive'>>(
  agents: T[] | null | undefined,
  officeId: number | null | undefined,
  options: { activeOnly?: boolean } = {}
): T[] {
  const activeOnly = options.activeOnly ?? false;
  return (agents || []).filter(agent => {
    if (activeOnly && !agent.isActive) {
      return false;
    }
    return agentHasOfficeAccess(agent, officeId);
  });
}
