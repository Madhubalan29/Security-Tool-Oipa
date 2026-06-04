import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SecurityGroupService } from '../../services/security-group.service';
import { SecurityStateService } from '../../services/security-state.service';
import { SecurityGroupDto } from '../../models/security-group.model';

@Component({
  selector: 'app-modify-group',
  templateUrl: './modify-group.component.html',
  styleUrls: ['./modify-group.component.scss']
})
export class ModifyGroupComponent implements OnInit {
  groups: SecurityGroupDto[] = [];
  filteredGroups: SecurityGroupDto[] = [];
  isLoading = true;
  searchQuery = '';
  selectedGuid = '';
  newCloneName = '';

  // Determine if this is clone or modify mode
  isCloneMode = false;

  constructor(
    private router: Router,
    private securityGroupService: SecurityGroupService,
    private stateService: SecurityStateService
  ) {}

  ngOnInit(): void {
    this.isCloneMode = this.stateService.currentMode === 'clone';
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

      // Clone mode: create a new group GUID first, then load config from source
      this.securityGroupService.createGroup(this.newCloneName).subscribe({
        next: (result) => {
          this.stateService.setMode('clone');
          this.stateService.setCloneSourceGuid(this.selectedGuid);
          this.stateService.setGroupGuid(result.securityGroupGuid);
          this.stateService.setGroupName(this.newCloneName);
          this.stateService.clearConfigState();
          this.router.navigate(['/security-group/configure']);
        },
        error: (err) => {
          console.error('Failed to create clone group:', err);
        }
      });
    } else {
      // Modify mode
      this.stateService.setMode('modify');
      this.stateService.setGroupGuid(this.selectedGuid);
      this.stateService.setGroupName(group?.groupName || '');
      this.stateService.clearConfigState();
      this.router.navigate(['/security-group/configure']);
    }
  }
}
