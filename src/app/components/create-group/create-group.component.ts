import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { SecurityGroupService } from '../../services/security-group.service';
import { SecurityStateService } from '../../services/security-state.service';
import { SqlConfirmDialogComponent } from '../sql-confirm-dialog/sql-confirm-dialog.component';

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
    private dialog: MatDialog,
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
        const dialogRef = this.dialog.open(SqlConfirmDialogComponent, {
          width: '650px',
          data: {
            title: 'Confirm Group Creation Query',
            subtitle: 'Review the SQL query to insert the new security group.',
            script: response.insertScript,
            confirmLabel: 'Confirm & Create'
          }
        });

        dialogRef.afterClosed().subscribe(confirm => {
          if (confirm) {
            this.isLoading = true;
            this.securityGroupService.executeScripts([response.insertScript]).subscribe({
              next: () => {
                this.stateService.setMode('create');
                this.stateService.setGroupGuid(response.securityGroupGuid);
                this.stateService.setGroupName(groupName);
                this.isLoading = false;
                this.router.navigate(['/security-group/configure']);
              },
              error: (err) => {
                this.isLoading = false;
                this.errorMessage = err?.error?.message || 'Failed to execute the SQL query on database. Please try again.';
                console.error('Execute script error:', err);
              }
            });
          } else {
            this.isLoading = false;
          }
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to generate create query for the security group. Please try again.';
        console.error('Create group error:', err);
      }
    });
  }
}
