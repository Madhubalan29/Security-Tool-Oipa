import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserDto, GetUsersResponse, CreateUsersResponse, UserSecurityGroup } from '../models/user.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private baseUrl = '/api/PASService/rest/services/v1';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Basic ' + btoa('sladmin:sladmin123')
    });
  }

  getUsers(limit: number = 100, offset: number = 0): Observable<GetUsersResponse> {
    const headers = this.getHeaders();
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());
    return this.http.get<GetUsersResponse>(`${this.baseUrl}/users`, { headers, params });
  }

  getUser(loginName: string): Observable<any> {
    const headers = this.getHeaders();
    return this.http.get<any>(`${this.baseUrl}/users/${loginName}`, { headers });
  }

  getUserSecurityGroups(loginName: string): Observable<{ securityGroups: UserSecurityGroup[] }> {
    const headers = this.getHeaders();
    return this.http.get<{ securityGroups: UserSecurityGroup[] }>(`${this.baseUrl}/users/${loginName}/securityGroups`, { headers });
  }

  createUser(user: UserDto): Observable<CreateUsersResponse> {
    const headers = this.getHeaders();
    // OIPA API expects: { users: [ { ... } ] }
    const payload = { users: [user] };
    return this.http.post<CreateUsersResponse>(`${this.baseUrl}/users`, payload, { headers });
  }

  updateUser(loginName: string, user: UserDto): Observable<void> {
    const headers = this.getHeaders();
    // OIPA API expects: { user: { ... } }
    const payload = { user };
    return this.http.patch<void>(`${this.baseUrl}/users/${loginName}`, payload, { headers });
  }

  deleteUser(loginName: string): Observable<void> {
    const headers = this.getHeaders();
    return this.http.delete<void>(`${this.baseUrl}/users/${loginName}`, { headers });
  }
}
