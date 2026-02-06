import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { AgentRequest, AgentResponse } from '../models/agent.model';

@Injectable({
    providedIn: 'root'
})

export class AgentService {
  
  private readonly controller = this.configService.config().apiUrl + 'agent/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

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




