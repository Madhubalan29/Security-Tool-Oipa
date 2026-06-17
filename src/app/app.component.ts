import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SecurityStateService } from './services/security-state.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'OIPA Admin Module';
  isLoginPage = true;
  sidenavOpened = true;

  constructor(
    private router: Router,
    private stateService: SecurityStateService,
    private authService: AuthService
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      this.isLoginPage = url === '/login';

      // If user reloaded on a non-login page but never logged in, redirect to login
      if (!this.isLoginPage && !this.authService.isLoggedIn()) {
        this.router.navigate(['/login']);
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.stateService.resetState();
    this.router.navigate(['/login']);
  }
}

