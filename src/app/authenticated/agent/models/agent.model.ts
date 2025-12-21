export interface AgentRequest {
  agentId?: string;
  organizationId: string;
  agentCode: string;
  description: string;
  isActive: boolean;
}

export interface AgentResponse {
  agentId: string;
  organizationId: string;
  agentCode: string;
  description: string;
  isActive: boolean;
}

export interface AgentListDisplay {
  agentId: string;
  agentCode: string;
  description: string;
  isActive: boolean;
}




