import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, take, tap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AgentRequest, AgentResponse } from '../models/agent.model';

@Injectable({
    providedIn: 'root'
})

export class AgentService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'organization/agent/';
  private allAgents$ = new BehaviorSubject<AgentResponse[]>([]);
  private agentsLoaded$ = new BehaviorSubject<boolean>(false);

  loadAllAgents(): Observable<AgentResponse[]> {
    return this.http.get<AgentResponse[]>(this.controller).pipe(
      map(agents => agents || []),
      tap(agents => {
        this.allAgents$.next(agents);
        this.agentsLoaded$.next(true);
      }),
      catchError(() => {
        this.allAgents$.next([]);
        this.agentsLoaded$.next(true);
        return of([]);
      })
    );
  }

  ensureAgentsLoaded(): Observable<AgentResponse[]> {
    if (this.agentsLoaded$.value) {
      return this.getAllAgents().pipe(take(1));
    }
    return this.loadAllAgents().pipe(take(1), switchMap(() => this.getAllAgents().pipe(take(1))));
  }

  refreshAgents(): Observable<AgentResponse[]> {
    return this.loadAllAgents().pipe(take(1), switchMap(() => this.getAllAgents().pipe(take(1))));
  }

  notifyAgentsChanged(): void {
    this.refreshAgents().pipe(take(1)).subscribe({ error: () => {} });
  }

  refreshCacheAfterMutation<T>(source: Observable<T>): Observable<T> {
    return source.pipe(switchMap(result => this.loadAllAgents().pipe(map(() => result))));
  }

  clearAgents(): void {
    this.allAgents$.next([]);
    this.agentsLoaded$.next(false);
  }

  getAllAgents(): Observable<AgentResponse[]> {
    return this.allAgents$;
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
    return this.refreshCacheAfterMutation(this.http.post<AgentResponse>(this.controller, agent));
  }

  // PUT: Update entire agent
  updateAgent(agent: AgentRequest): Observable<AgentResponse> {
    return this.refreshCacheAfterMutation(this.http.put<AgentResponse>(this.controller, agent));
  }

  // DELETE: Delete agent
  deleteAgent(agentId: string): Observable<void> {
    return this.refreshCacheAfterMutation(this.http.delete<void>(this.controller + agentId));
  }
}



