export interface AgentRequest {
  agentId?: string;
  organizationId: string;
  officeId?: number;
  agentCode: string;
  name: string;
  isActive: boolean;
}

export interface AgentResponse {
  agentId: string;
  organizationId: string;
  officeId?: number;
  agentCode: string;
  name: string;
  isActive: boolean;
}

export interface AgentListDisplay {
  agentId: string;
  agentCode: string;
  officeId?: number;
  officeName?: string;
  name: string;
  isActive: boolean;
}




