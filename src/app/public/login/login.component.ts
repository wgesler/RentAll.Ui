
import { HttpErrorResponse } from '@angular/common/http';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../app.routes';
import { StartupPage, UserGroups } from '../../authenticated/users/models/user-enums';
import { StorageKey } from '../../enums/storage-keys.enum';
import { MaterialModule } from '../../material.module';
import { emailRegex } from '../../regex/email-regex';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { LoginRequest } from './models/login-request';

@Component({
    selector: 'app-login',
    imports: [MaterialModule, ReactiveFormsModule, FormsModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})

export class LoginComponent {
  checked = false;
  disabled = false;
  hide = true;
  isSubmitting = false;
  username: string = '';
  password: string = '';
  rememberMe: boolean = false;

  form: FormGroup = new FormGroup({
    title: new FormControl(''),
    description: new FormControl('')
  });

  constructor(
      private fb: FormBuilder,
      private router: Router,
      private toastr: ToastrService,
      private storageService: StorageService,
      private authService: AuthService)
  {
    const username = this.storageService.getItem(StorageKey.Username);
    const password = this.storageService.getItem(StorageKey.Password);
 
    if (username) { this.username = username }
    if (password) { this.password = password }
    this.rememberMe = !!(username || password);

    this.form = this.fb.group({
      username: [this.username, [Validators.required, Validators.pattern(emailRegex)]],
      password: [this.password],
      rememberMe: [this.rememberMe]
    });
  }

  //#region Login
  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    
    this.isSubmitting = true;
    this.rememberMe = this.form.value.rememberMe;

    if (this.rememberMe) {
      this.storageService.addItem(StorageKey.Username, this.form.value.username);
      this.storageService.addItem(StorageKey.Password, this.form.value.password);
    } else {
      this.storageService.removeItem(StorageKey.Username);
      this.storageService.removeItem(StorageKey.Password);
    }

    this.authService.login(this.getLoginRequest()).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        if (this.authService.getIsLoggedIn()) {
          const user = this.authService.getUser();

          if (this.hasOwnerRole(user?.userGroups || [])) {
            this.router.navigateByUrl(RouterUrl.DashboardOwner);
            return;
          }

          const startupPageId = user?.startupPageId ?? StartupPage.Dashboard;
          
          // Redirect based on user's startup page preference
          let redirectUrl: string;
          switch (startupPageId) {
            case StartupPage.Dashboard:
              redirectUrl = RouterUrl.Dashboard;
              break;
            case StartupPage.Boards:
              redirectUrl = RouterUrl.ReservationBoard;
              break;
            case StartupPage.Reservations:
              redirectUrl = RouterUrl.ReservationList;
              break;
            case StartupPage.Properties:
              redirectUrl = RouterUrl.PropertyList;
              break;
            case StartupPage.Accounting:
              redirectUrl = RouterUrl.AccountingList;
              break;
            case StartupPage.Organizations:
              redirectUrl = RouterUrl.OrganizationList;
              break;
             default:
              redirectUrl = RouterUrl.Dashboard;
              break;
          }
          
          this.router.navigateByUrl(redirectUrl);
        } else {
           this.toastr.error('User is not logged in', 'Redirect Failed...');
        }
      },
      error: (err: HttpErrorResponse) => {
        const loginFailed = 'Login Failed...';
        if (err.status === 400 || err.status === 401) {
          if (err.error?.message?.includes('invalid_grant')) {
            this.toastr.error('Invalid email or password', loginFailed);
          }
          else if (err.error?.message?.includes('not verified')) {
            this.toastr.error('Please verify your email', loginFailed);
          } 
          else {
            // Show a user-friendly message, fallback to server message if available
            const errorMessage = err.error?.message || 'Invalid email or password';
            this.toastr.error(errorMessage, loginFailed);
          }
        } else {
          // For all other errors (network, server errors, etc.), show login failed message
          this.toastr.error('Please try again', loginFailed);
        }
      }
    });
  }

  returnToHome(): void {
      this.router.navigate(['']);
  }

  getLoginRequest(): LoginRequest {
    return {username: this.form.value.username, password: this.form.value.password} as LoginRequest;
  }

  private hasOwnerRole(userGroups: string[]): boolean {
    return (userGroups || []).some(group => {
      if (group === 'Owner') {
        return true;
      }

      const parsed = parseInt(String(group), 10);
      return !isNaN(parsed) && parsed === UserGroups.Owner;
    });
  }
  //#endregion
}
