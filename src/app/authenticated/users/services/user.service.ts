import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UserRequest, UserResponse } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})

export class UserService {
  
  private readonly controller = this.configService.config().apiUrl + 'user/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all users
  getUsers(): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(this.controller);
  }

  // GET: Get user by ID
  getUserByGuid(userId: string): Observable<UserResponse> {
    return this.http.get<UserResponse>(this.controller + userId);
  }

  // POST: Create a new user
  createUser(user: UserRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(this.controller, user);
  }

  // PUT: Update entire user
  updateUser(user: UserRequest): Observable<UserResponse> {
    return this.http.put<UserResponse>(this.controller, user);
  }

  // DELETE: Delete user
  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(this.controller + userId);
  }
}












