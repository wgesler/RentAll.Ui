
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize, map, of, switchMap, take } from 'rxjs';
import { StorageKey } from '../../enums/storage-keys.enum';
import { CommonMessage, CommonTimeouts } from '../../enums/common-message.enum';
import { MaterialModule } from '../../material.module';
import { GlobalSelectionService } from '../../authenticated/organizations/services/global-selection.service';
import { emailRegex } from '../../regex/email-regex';
import { AuthService } from '../../services/auth.service';
import { teardownCdkOverlayState, teardownCdkOverlayStateAfterPaint } from '../../shared/utils/cdk-overlay.util';
import { StorageService } from '../../services/storage.service';
import { LoginRequest } from './models/login-request';

@Component({
    standalone: true,
    selector: 'app-login',
    imports: [MaterialModule, ReactiveFormsModule, FormsModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})

export class LoginComponent implements OnInit, AfterViewInit {
  readonly headerLogoUrl = '/assets/images/RentAll_TwoHouses_NoCardinal_Transparent.png';
  readonly backdropLogoUrl = '/assets/images/login-backdrop-rentall-exchange.png';

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
      private authService: AuthService,
      private globalSelectionService: GlobalSelectionService)
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

  ngOnInit(): void {
    teardownCdkOverlayState();
  }

  ngAfterViewInit(): void {
    teardownCdkOverlayStateAfterPaint(() => teardownCdkOverlayState());
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

    this.authService.login(this.getLoginRequest()).pipe(
      take(1),
      switchMap(() => {
        const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
        if (!organizationId) {
          return of(true);
        }
        return this.globalSelectionService.ensureOfficeScope(organizationId).pipe(
          map(scope => this.globalSelectionService.verifyMainProgramAccess(scope.features))
        );
      }),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
      next: (allowed) => {
        if (!allowed) {
          this.authService.logout();
          return;
        }
        if (this.authService.getIsLoggedIn()) {
          this.router.navigateByUrl(this.authService.getStartupPageUrl());
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

  onCredentialFieldFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

    setTimeout(() => input.select(), 0);
  }

  getLoginRequest(): LoginRequest {
    return {username: this.form.value.username, password: this.form.value.password} as LoginRequest;
  }
  //#endregion
}
