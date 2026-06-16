import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { SecurityGroupService } from '../../services/security-group.service';
import { SecurityStateService } from '../../services/security-state.service';
import { SecurityGroupDto } from '../../models/security-group.model';
import { SqlConfirmDialogComponent } from '../sql-confirm-dialog/sql-confirm-dialog.component';

@Component({
  selector: 'app-modify-group',
  templateUrl: './modify-group.component.html',
  styleUrls: ['./modify-group.component.scss']
})
export class ModifyGroupComponent implements OnInit {
  groups: SecurityGroupDto[] = [];
  filteredGroups: SecurityGroupDto[] = [];
  isLoading = true;
  isProcessing = false;
  searchQuery = '';
  selectedGuid = '';
  newCloneName = '';

  // Determine if this is clone, modify, or view mode
  isCloneMode = false;
  isViewMode = false;

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private securityGroupService: SecurityGroupService,
    private stateService: SecurityStateService
  ) {}

  ngOnInit(): void {
    this.isCloneMode = this.stateService.currentMode === 'clone';
    this.isViewMode = this.stateService.currentMode === 'view';
    this.loadGroups();
  }

  loadGroups(): void {
    this.isLoading = true;
    this.securityGroupService.getAllGroups().subscribe({
      next: (groups) => {
        this.groups = groups;
        this.filteredGroups = groups;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load security groups:', err);
        this.isLoading = false;
      }
    });
  }

  onSearch(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredGroups = this.groups.filter(g =>
      g.groupName.toLowerCase().includes(q)
    );
  }

  selectGroup(group: SecurityGroupDto): void {
    this.selectedGuid = group.securityGroupGuid || '';
    if (this.isCloneMode) {
      this.newCloneName = group.groupName + ' (Clone)';
    }
  }

  proceedToConfig(): void {
    if (!this.selectedGuid) return;

    const group = this.groups.find(g => g.securityGroupGuid === this.selectedGuid);

    if (this.isCloneMode) {
      if (!this.newCloneName.trim()) return;

      this.isProcessing = true;
      // Clone mode: create a new group GUID first, then load config from source
      this.securityGroupService.createGroup(this.newCloneName).subscribe({
        next: (result) => {
          const dialogRef = this.dialog.open(SqlConfirmDialogComponent, {
            width: '650px',
            data: {
              title: 'Confirm Clone Group Creation Query',
              subtitle: 'Review the SQL query to insert the cloned security group.',
              script: result.insertScript,
              confirmLabel: 'Confirm & Clone'
            }
          });

          dialogRef.afterClosed().subscribe(confirm => {
            if (confirm) {
              this.isProcessing = true;
              this.securityGroupService.executeScripts([result.insertScript]).subscribe({
                next: () => {
                  this.stateService.setMode('clone');
                  this.stateService.setCloneSourceGuid(this.selectedGuid);
                  this.stateService.setGroupGuid(result.securityGroupGuid);
                  this.stateService.setGroupName(this.newCloneName);
                  this.stateService.clearConfigState();
                  this.isProcessing = false;
                  this.router.navigate(['/security-group/configure']);
                },
                error: (err) => {
                  this.isProcessing = false;
                  console.error('Failed to execute clone group creation query:', err);
                  alert(err?.error?.message || 'Failed to execute the SQL query on database. Please try again.');
                }
              });
            } else {
              this.isProcessing = false;
            }
          });
        },
        error: (err) => {
          this.isProcessing = false;
          console.error('Failed to create clone group:', err);
          alert(err?.error?.message || 'Failed to generate clone group creation query. Please try again.');
        }
      });
    } else {
      // Modify or View mode
      const modeToSet = this.isViewMode ? 'view' : 'modify';
      this.stateService.setMode(modeToSet);
      this.stateService.setGroupGuid(this.selectedGuid);
      this.stateService.setGroupName(group?.groupName || '');
      this.stateService.clearConfigState();
      this.router.navigate(['/security-group/configure']);
    }
  }
}
