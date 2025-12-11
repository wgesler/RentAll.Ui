export interface AgentRequest {
  agentId?: string;
  agentCode: string;
  description: string;
  isActive: boolean;
}

export interface AgentResponse {
  agentId: string;
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

