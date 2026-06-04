import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SecurityStateService } from './services/security-state.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'OIPA Security Tool';
  isLoginPage = true;
  sidenavOpened = true;

  constructor(
    private router: Router,
    private stateService: SecurityStateService
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      this.isLoginPage = url === '/login';

      // If user reloaded on a non-login page but never logged in, redirect to login
      if (!this.isLoginPage && !sessionStorage.getItem('sg_loggedIn')) {
        this.router.navigate(['/login']);
      }
    });
  }

  logout(): void {
    sessionStorage.removeItem('sg_loggedIn');
    this.stateService.resetState();
    this.router.navigate(['/login']);
  }
}

