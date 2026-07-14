import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UserActivityResponse, UserRequest, UserResponse } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})

export class UserService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'auth/user/';

  getUsers(): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(this.controller);
  }

  getUsersByType(roletype: string): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(this.controller + 'role/' + roletype);
  }

  getUserByGuid(userId: string): Observable<UserResponse> {
    return this.http.get<UserResponse>(this.controller + userId);
  }

  getUserActivity(): Observable<UserActivityResponse[]> {
    return this.http.get<UserActivityResponse[]>(this.controller + 'activity');
  }

  getAgentId(userId: string): Observable<string | null> {
    return this.getUserByGuid(userId).pipe(
      map(user => {
        const normalizedAgentId = String(user?.agentId || '').trim();
        return normalizedAgentId || null;
      })
    );
  }

  createUser(user: UserRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(this.controller, user);
  }

  updateUser(user: UserRequest): Observable<UserResponse> {
    return this.http.put<UserResponse>(this.controller, user);
  }

  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(this.controller + userId);
  }
}

