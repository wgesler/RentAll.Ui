import { CommonModule} from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { MaterialModule } from '../../material.module';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LoginRequest } from './models/login-request';
import { emailRegex } from '../../regex/email-regex';
import { AuthService } from '../../services/auth.service';
import { finalize, take } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonMessage } from '../../enums/common-message.enum';
import { StorageService } from '../../services/storage.service';
import { RouterToken, RouterUrl } from '../../app.routes';
import { StorageKey } from '../../enums/storage-keys.enum';
import { UserGroups } from '../../authenticated/user/models/user-type';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
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
          // Check if user is SuperAdmin and redirect to OrganizationList
          const user = this.authService.getUser();
          if (user && user.userGroups) {
            const userGroupNumbers = user.userGroups.map(group => {
              if (typeof group === 'string') {
                const enumKey = Object.keys(UserGroups).find(key => key === group);
                if (enumKey) {
                  return UserGroups[enumKey as keyof typeof UserGroups];
                }
                const num = parseInt(group, 10);
                if (!isNaN(num)) {
                  return num;
                }
              }
              return typeof group === 'number' ? group : null;
            }).filter(num => num !== null) as number[];

            if (userGroupNumbers.includes(UserGroups.SuperAdmin)) {
              this.router.navigateByUrl(RouterUrl.OrganizationList);
            } else {
              this.router.navigateByUrl(RouterToken.Auth);
            }
          } else {
            this.router.navigateByUrl(RouterToken.Auth);
          }
        } else {
           this.toastr.error('User is not logged in', 'Redirect Failed...');
        }
      },
      error: (err: HttpErrorResponse) => {
        const loginFailed = 'Login Failed...';
        if (err.status !== 400) {
          this.toastr.error('Could not request login at this time. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        } else {
          if (err.error.message.includes('invalid_grant')) {
            this.toastr.error('Invalid Credentials', loginFailed);
          }
          else if (err.error.message.includes('not verified')) {
            this.toastr.error('Please verify your email', loginFailed);
          } 
          else {
            this.toastr.error(err.error.message, loginFailed);
          }
        }
      }
    });
  }

  returnToHome(): void {
      this.router.navigate(['']);
  }

  private getLoginRequest(): LoginRequest {
    return {username: this.form.value.username, password: this.form.value.password} as LoginRequest;
  }
}
