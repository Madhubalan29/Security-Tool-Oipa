import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SecurityStateService } from '../../services/security-state.service';

@Component({
  selector: 'app-security-functions',
  templateUrl: './security-functions.component.html',
  styleUrls: ['./security-functions.component.scss']
})
export class SecurityFunctionsComponent {

  actions = [
    {
      title: 'Create New Security Group',
      description: 'Define a new security group from scratch and configure its permissions across companies, products, and plans.',
      icon: 'add_circle',
      route: '/security-group/create',
      mode: 'create' as const,
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
      shadowColor: 'rgba(16, 185, 129, 0.3)'
    },
    {
      title: 'Modify Existing Security Group',
      description: 'Select an existing security group to view and update its permission configuration.',
      icon: 'edit_note',
      route: '/security-group/modify',
      mode: 'modify' as const,
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
      shadowColor: 'rgba(245, 158, 11, 0.3)'
    },
    {
      title: 'Clone Existing Security Group',
      description: 'Copy an existing group\'s configuration as a starting point for a new group.',
      icon: 'content_copy',
      route: '/security-group/clone',
      mode: 'clone' as const,
      gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      shadowColor: 'rgba(139, 92, 246, 0.3)'
    }
  ];

  constructor(
    private router: Router,
    private stateService: SecurityStateService
  ) {}

  selectAction(action: any): void {
    this.stateService.setMode(action.mode);
    this.router.navigate([action.route]);
  }
}
