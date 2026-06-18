import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { UserService } from '../../services/user.service';
import { LookupService } from '../../services/lookup.service';
import { SecurityGroupService } from '../../services/security-group.service';
import { UserDto, UserSecurityGroup } from '../../models/user.model';
import { AsCompany } from '../../models/lookup.model';
import { SecurityGroupDto } from '../../models/security-group.model';

@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.scss']
})
export class UserFormComponent implements OnInit {
  userForm!: FormGroup;
  isEditMode: boolean = false;
  loginName: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  // Lookups
  companies: AsCompany[] = [];
  securityGroups: SecurityGroupDto[] = [];
  availableSecurityGroupsForAssign: SecurityGroupDto[] = [];

  // Mapped Security Groups for the User
  assignedGroups: UserSecurityGroup[] = [];

  // Temp form fields to add a new security group mapping
  selectedGroupToAdd: string = '';
  effectiveDateToAdd: string = '';

  // Options
  encryptions = ['SHA-512', 'SHA-256', 'MD5'];
  genders = [
    { value: '01', label: 'Male' },
    { value: '02', label: 'Female' },
    { value: '03', label: 'Unknown/Other' }
  ];
  statuses = [
    { value: '01', label: 'Active' },
    { value: '02', label: 'Inactive' }
  ];
  locales = [
    { value: '00', label: 'English (US)' },
    { value: '01', label: 'English (UK)' },
    { value: '02', label: 'Spanish' },
    { value: '03', label: 'French' },
    { value: '04', label: 'German' },
    { value: '05', label: 'Japanese' }
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private lookupService: LookupService,
    private securityGroupService: SecurityGroupService,
    private snackBar: MatSnackBar
  ) {
    this.initForm();
    // Default effective date to current date
    const today = new Date();
    this.effectiveDateToAdd = today.toISOString().substring(0, 10);
  }

  ngOnInit(): void {
    this.isLoading = true;

    // Load lookups in parallel
    forkJoin({
      companies: this.lookupService.getCompanies(),
      groups: this.securityGroupService.getAllGroups()
    }).subscribe({
      next: (data) => {
        this.companies = data.companies || [];
        this.securityGroups = data.groups || [];
        
        // Detect mode
        this.route.params.subscribe(params => {
          if (params['loginName']) {
            this.isEditMode = true;
            this.loginName = params['loginName'];
            this.loadUserData();
          } else {
            this.isEditMode = false;
            this.updateAvailableGroupsForAssign();
            this.isLoading = false;
          }
        });
      },
      error: (err) => {
        console.error('Error loading lookups:', err);
        this.errorMessage = 'Failed to load support lookup data (companies / groups).';
        this.isLoading = false;
      }
    });
  }

  private initForm(): void {
    this.userForm = this.fb.group({
      loginName: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_\-]+$/)]],
      password: [''],
      passwordEncryption: ['SHA-512', Validators.required],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      primaryCompany: ['', Validators.required],
      sex: ['01', Validators.required], // Default to Male
      userStatus: ['01', Validators.required], // Default to Active
      localeCode: ['00', Validators.required] // Default to English (US)
    });
  }

  loadUserData(): void {
    forkJoin({
      user: this.userService.getUser(this.loginName),
      groups: this.userService.getUserSecurityGroups(this.loginName)
    }).subscribe({
      next: (data: any) => {
        const user = data.user.user;
        // Map Gender from GET response ('M', 'F', ' ', '01', '02', '03') to dropdown 'sex'
        let mappedSex = '03'; // Default to Unknown
        const genderVal = user.client?.gender || user.client?.sex;
        if (genderVal === 'M' || genderVal === '01') {
          mappedSex = '01';
        } else if (genderVal === 'F' || genderVal === '02') {
          mappedSex = '02';
        }

        this.userForm.patchValue({
          loginName: user.loginName,
          password: '', // Do not populate password
          passwordEncryption: user.passwordEncryption || 'SHA-512',
          firstName: user.client?.firstName || '',
          lastName: user.client?.lastName || '',
          email: user.client?.email || '',
          primaryCompany: user.client?.primaryCompany || '',
          sex: mappedSex,
          userStatus: user.userStatus || '01',
          localeCode: user.localeCode || '00'
        });

        // Keep loginName enabled to allow modification

        // Load assigned groups
        this.assignedGroups = data.groups.securityGroups || [];
        this.updateAvailableGroupsForAssign();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading user data:', err);
        this.errorMessage = `Failed to load user data for "${this.loginName}".`;
        this.isLoading = false;
      }
    });
  }

  updateAvailableGroupsForAssign(): void {
    const assignedNames = this.assignedGroups.map(ag => ag.securityGroupName.trim().toLowerCase());
    this.availableSecurityGroupsForAssign = this.securityGroups.filter(
      sg => !assignedNames.includes(sg.groupName.trim().toLowerCase())
    );
    this.selectedGroupToAdd = '';
  }

  addSecurityGroup(): void {
    if (!this.selectedGroupToAdd || !this.effectiveDateToAdd) {
      return;
    }

    const groupName = this.selectedGroupToAdd;
    // Format effective date to OIPA format: YYYY-MM-DDTHH:mm:ssZ
    // If date is YYYY-MM-DD, append T00:00:00Z
    let formattedDate = this.effectiveDateToAdd;
    if (formattedDate.length === 10) {
      formattedDate = `${formattedDate}T00:00:00Z`;
    }

    this.assignedGroups.push({
      securityGroupName: groupName,
      roleEffectiveFrom: formattedDate
    });

    this.updateAvailableGroupsForAssign();
  }

  removeSecurityGroup(index: number): void {
    this.assignedGroups.splice(index, 1);
    this.updateAvailableGroupsForAssign();
  }

  onCancel(): void {
    this.router.navigate(['/users']);
  }

  onSubmit(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const formVal = this.userForm.getRawValue();

    // Validate password for new user
    if (!this.isEditMode && (!formVal.password || formVal.password.trim() === '')) {
      this.snackBar.open('Password is required when creating a new user.', 'Close', { duration: 4000 });
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    // Map sex code ('01', '02', '03') to OIPA gender representation ('M', 'F', null)
    const userPayload: UserDto = {
      loginName: formVal.loginName.trim(),
      userStatus: formVal.userStatus,
      localeCode: formVal.localeCode,
      passwordEncryption: formVal.passwordEncryption,
      client: {
        firstName: formVal.firstName.trim(),
        lastName: formVal.lastName.trim(),
        gender: formVal.sex === '01' ? 'M' : (formVal.sex === '02' ? 'F' : null) as any,
        email: formVal.email.trim(),
        primaryCompany: formVal.primaryCompany
      },
      securityGroup: this.assignedGroups.map(sg => {
        let effDate = sg.roleEffectiveFrom;
        if (effDate) {
          effDate = effDate.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(effDate)) {
            effDate = `${effDate}T00:00:00Z`;
          } else if (/^\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}:\d{2}$/.test(effDate)) {
            effDate = `${effDate}Z`;
          }
        }
        return {
          ...sg,
          roleEffectiveFrom: effDate
        };
      })
    };

    if (formVal.password && formVal.password.trim() !== '') {
      userPayload.password = formVal.password;
    }

    if (this.isEditMode) {
      this.userService.updateUser(this.loginName, userPayload).subscribe({
        next: () => {
          this.snackBar.open(`User "${userPayload.loginName}" has been successfully updated.`, 'Close', {
            duration: 4000,
            panelClass: ['success-snackbar']
          });
          this.router.navigate(['/users']);
        },
        error: (err) => {
          console.error('Error updating user:', err);
          this.errorMessage = err?.error?.message || 'Failed to update user configuration in OIPA Service Layer.';
          this.isLoading = false;
        }
      });
    } else {
      this.userService.createUser(userPayload).subscribe({
        next: () => {
          this.snackBar.open(`User "${userPayload.loginName}" has been successfully created.`, 'Close', {
            duration: 4000,
            panelClass: ['success-snackbar']
          });
          this.router.navigate(['/users']);
        },
        error: (err) => {
          console.error('Error creating user:', err);
          this.errorMessage = err?.error?.message || 'Failed to create user account in OIPA Service Layer.';
          this.isLoading = false;
        }
      });
    }
  }

  getEffectiveDateLabel(isoString: string): string {
    if (!isoString) return '';
    return isoString.split('T')[0];
  }
}
