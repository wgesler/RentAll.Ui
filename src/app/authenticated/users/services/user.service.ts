import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UserRequest, UserResponse } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})

export class UserService {
  private readonly controller = this.configService.config().apiUrl + 'auth/user/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  getUsers(): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(this.controller);
  }

  getUsersByType(roletype: string): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(this.controller + 'role/' + roletype);
  }

  getUserByGuid(userId: string): Observable<UserResponse> {
    return this.http.get<UserResponse>(this.controller + userId);
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

