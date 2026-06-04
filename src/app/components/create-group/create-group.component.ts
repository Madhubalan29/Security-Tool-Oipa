import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SecurityGroupService } from '../../services/security-group.service';
import { SecurityStateService } from '../../services/security-state.service';

@Component({
  selector: 'app-create-group',
  templateUrl: './create-group.component.html',
  styleUrls: ['./create-group.component.scss']
})
export class CreateGroupComponent {
  createForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private securityGroupService: SecurityGroupService,
    private stateService: SecurityStateService
  ) {
    this.createForm = this.fb.group({
      groupName: ['', [Validators.required, Validators.minLength(2)]]
    });
  }

  onCreate(): void {
    if (this.createForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';
    const groupName = this.createForm.value.groupName.trim();

    this.securityGroupService.createGroup(groupName).subscribe({
      next: (response) => {
        this.stateService.setMode('create');
        this.stateService.setGroupGuid(response.securityGroupGuid);
        this.stateService.setGroupName(groupName);
        this.isLoading = false;
        this.router.navigate(['/security-group/configure']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to create security group. Please try again.';
        console.error('Create group error:', err);
      }
    });
  }
}
