import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {

  modules = [
    {
      title: 'Security Group',
      description: 'Create and manage security groups with deeply nested permission mappings for companies, products, plans, and transactions.',
      icon: 'admin_panel_settings',
      route: '/security-group',
      enabled: true,
      gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
      shadowColor: 'rgba(79, 70, 229, 0.3)'
    },
    {
      title: 'User',
      description: 'Manage user accounts, assign security groups, and configure individual user permissions.',
      icon: 'group',
      route: '/users',
      enabled: true,
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
      shadowColor: 'rgba(6, 182, 212, 0.3)'
    }
  ];

  constructor(private router: Router) {}

  navigateToModule(module: any): void {
    if (module.enabled && module.route) {
      this.router.navigate([module.route]);
    }
  }
}
