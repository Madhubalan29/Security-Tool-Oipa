import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface LoginResponse {
  status: string;
  message: string;
  tokenId: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private baseUrl = environment.authApiUrl;

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/ivs/auth/login`, { username, password }).pipe(
      tap(res => {
        if (res.status === 'AUTHORIZED' && res.tokenId) {
          sessionStorage.setItem('sg_loggedIn', 'true');
          sessionStorage.setItem('sg_tokenId', res.tokenId);
        }
      })
    );
  }

  validateToken(tokenId: string): Observable<boolean> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/ivs/auth/validate-token`, { tokenId }).pipe(
      map(res => res.status === 'AUTHORIZED'),
      catchError(() => of(false))
    );
  }

  isLoggedIn(): boolean {
    return sessionStorage.getItem('sg_loggedIn') === 'true' && !!sessionStorage.getItem('sg_tokenId');
  }

  getToken(): string | null {
    return sessionStorage.getItem('sg_tokenId');
  }

  logout(): void {
    sessionStorage.removeItem('sg_loggedIn');
    sessionStorage.removeItem('sg_tokenId');
  }
}
