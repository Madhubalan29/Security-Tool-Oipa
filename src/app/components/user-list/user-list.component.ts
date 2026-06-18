import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserService } from '../../services/user.service';
import { UserDto } from '../../models/user.model';
import { Subject, of, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss']
})
export class UserListComponent implements OnInit, OnDestroy {
  users: UserDto[] = [];
  filteredUsers: UserDto[] = [];
  searchQuery: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  // Pagination & Scroll Loading
  limit: number = 100;
  offset: number = 0;
  hasMore: boolean = true;
  isLoadingMore: boolean = false;

  // Debounced API Search
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

  displayedColumns: string[] = ['loginName', 'name', 'email', 'company', 'status', 'actions'];

  constructor(
    private userService: UserService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadUsers(true);
    this.setupSearchSubscription();
  }

  ngOnDestroy(): void {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  setupSearchSubscription(): void {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap((query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
          return of(null);
        }
        this.isLoading = true;
        this.errorMessage = '';
        return this.userService.getUser(trimmedQuery).pipe(
          catchError((err) => {
            console.error('Error searching user:', err);
            return of({ user: null });
          })
        );
      })
    ).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res === null) {
          this.filteredUsers = [...this.users];
        } else {
          const foundUser = res.user ? res.user : (res.loginName ? res : null);
          if (foundUser) {
            this.filteredUsers = [foundUser];
          } else {
            this.filteredUsers = [];
          }
        }
      },
      error: (err) => {
        console.error('Search subscription error:', err);
        this.isLoading = false;
      }
    });
  }

  loadUsers(isInitial: boolean = true): void {
    if (isInitial) {
      this.isLoading = true;
      this.offset = 0;
      this.users = [];
      this.hasMore = true;
    } else {
      this.isLoadingMore = true;
    }
    this.errorMessage = '';

    this.userService.getUsers(this.limit, this.offset).subscribe({
      next: (res) => {
        const rawUsers = res.users || [];
        const newUsers = rawUsers.map((item: any) => item.user ? item.user : item);
        
        if (isInitial) {
          this.users = newUsers;
        } else {
          this.users = [...this.users, ...newUsers];
        }

        if (newUsers.length < this.limit) {
          this.hasMore = false;
        }

        this.applyFilter();
        this.isLoading = false;
        this.isLoadingMore = false;
      },
      error: (err) => {
        console.error('Error fetching users:', err);
        if (isInitial) {
          this.errorMessage = 'Failed to load users. Please check server connection or configuration.';
        } else {
          this.snackBar.open('Failed to load more users.', 'Close', { duration: 3000 });
        }
        this.isLoading = false;
        this.isLoadingMore = false;
      }
    });
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll(): void {
    if (this.isLoading || this.isLoadingMore || !this.hasMore || this.searchQuery.trim()) {
      return;
    }

    const threshold = 150;
    const position = window.innerHeight + window.scrollY;
    const height = document.documentElement.scrollHeight;

    if (position >= height - threshold) {
      this.loadMore();
    }
  }

  loadMore(): void {
    this.offset += this.limit;
    this.loadUsers(false);
  }

  applyFilter(): void {
    const query = this.searchQuery.trim();
    if (!query) {
      this.filteredUsers = [...this.users];
      this.searchSubject.next('');
      return;
    }
    this.searchSubject.next(query);
  }

  onCreateUser(): void {
    this.router.navigate(['/users/create']);
  }

  onEditUser(user: UserDto): void {
    this.router.navigate(['/users/modify', user.loginName]);
  }

  onDeleteUser(user: UserDto): void {
    if (confirm(`Are you sure you want to delete/inactivate user "${user.loginName}"?`)) {
      this.isLoading = true;
      this.userService.deleteUser(user.loginName).subscribe({
        next: () => {
          this.snackBar.open(`User "${user.loginName}" has been successfully inactivated.`, 'Close', {
            duration: 4000,
            panelClass: ['success-snackbar']
          });
          this.loadUsers(); // reload from OIPA Service Layer
        },
        error: (err) => {
          console.error('Error deleting user:', err);
          this.snackBar.open(err?.error?.message || `Failed to delete/inactivate user "${user.loginName}".`, 'Close', {
            duration: 4000,
            panelClass: ['error-snackbar']
          });
          this.isLoading = false;
        }
      });
    }
  }

  getSecurityGroupNames(user: UserDto): string[] {
    if (!user.securityGroup || !Array.isArray(user.securityGroup)) {
      return [];
    }
    return user.securityGroup.map(sg => sg.securityGroupName);
  }

  getUserStatusLabel(status: string): string {
    return status === '01' ? 'Active' : 'Inactive';
  }
}
