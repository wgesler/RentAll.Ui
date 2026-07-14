import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AgentRequest, AgentResponse } from '../models/agent.model';

@Injectable({
    providedIn: 'root'
})

export class AgentService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  
  private readonly controller = this.configService.config().apiUrl + 'organization/agent/';

  // GET: Get all agents
  getAgents(): Observable<AgentResponse[]> {
    return this.http.get<AgentResponse[]>(this.controller);
  }

  // GET: Get agent by ID
  getAgentByGuid(agentId: string): Observable<AgentResponse> {
    return this.http.get<AgentResponse>(this.controller + agentId);
  }

  // POST: Create a new agent
  createAgent(agent: AgentRequest): Observable<AgentResponse> {
    return this.http.post<AgentResponse>(this.controller, agent);
  }

  // PUT: Update entire agent
  updateAgent(agent: AgentRequest): Observable<AgentResponse> {
    return this.http.put<AgentResponse>(this.controller, agent);
  }

  // DELETE: Delete agent
  deleteAgent(agentId: string): Observable<void> {
    return this.http.delete<void>(this.controller + agentId);
  }
}




