import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { UserService } from '../services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { UserResponse, UserRequest } from '../models/user.model';
import { UserGroups } from '../models/user-type';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss'
})

export class UserComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  userId: string;
  user: UserResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  hidePassword: boolean = true;
  hideConfirmPassword: boolean = true;
  availableUserGroups: { value: string, label: string }[] = [
    { value: 'SuperAdmin', label: 'Super Admin' },
    { value: 'Admin', label: 'Admin' },
    { value: 'User', label: 'User' }
  ];

  constructor(
    public userService: UserService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService
  ) {
    this.itemsToLoad.push('user');
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.userId = paramMap.get('id');
        this.isAddMode = this.userId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('user');
          this.buildForm();
          this.setupPasswordValidation();
        } else {
          this.getUser();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
      this.setupPasswordValidation();
    }
  }

  private setupPasswordValidation(): void {
    // Re-validate confirmPassword when password changes (real-time validation)
    this.form.get('password')?.valueChanges.subscribe(() => {
      const confirmPasswordControl = this.form.get('confirmPassword');
      if (confirmPasswordControl && confirmPasswordControl.value) {
        // Mark as touched so error shows immediately
        confirmPasswordControl.markAsTouched();
        confirmPasswordControl.updateValueAndValidity({ emitEvent: false });
        // Also trigger form-level validation
        this.form.updateValueAndValidity({ emitEvent: false });
      }
    });
    
    // Re-validate confirmPassword when confirmPassword changes (real-time validation as user types)
    this.form.get('confirmPassword')?.valueChanges.subscribe(() => {
      const confirmPasswordControl = this.form.get('confirmPassword');
      if (confirmPasswordControl && confirmPasswordControl.value) {
        // Mark as touched so error shows immediately while typing
        confirmPasswordControl.markAsTouched();
        confirmPasswordControl.updateValueAndValidity({ emitEvent: false });
        // Also trigger form-level validation
        this.form.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  buildForm(): void {
    const passwordValidators = this.isAddMode 
      ? [Validators.required, this.passwordStrengthValidator] 
      : [this.passwordStrengthValidator];
    
    const confirmPasswordValidators = this.isAddMode 
      ? [Validators.required, this.passwordMatchValidator.bind(this)] 
      : [this.passwordMatchValidator.bind(this)];
    
    this.form = this.fb.group({
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', passwordValidators),
      confirmPassword: new FormControl('', confirmPasswordValidators),
      userGroups: new FormControl([], [Validators.required, this.userGroupsRequiredValidator]),
      isActive: new FormControl(true)
    }, { validators: this.passwordMatchValidator });
  }

  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return null; // Let required validator handle empty values
    }

    const password = control.value;
    const errors: ValidationErrors = {};

    // Check minimum length
    if (password.length < 8) {
      errors['passwordMinLength'] = true;
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      errors['passwordRequiresNumber'] = true;
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors['passwordRequiresSpecial'] = true;
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }

  userGroupsRequiredValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || !Array.isArray(value) || value.length === 0) {
      return { userGroupsRequired: true };
    }
    return null;
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    // If this is called as a field validator (confirmPassword field)
    if (control.parent) {
      const password = control.parent.get('password');
      const confirmPassword = control;
      
      if (!password) {
        return null;
      }
      
      // Real-time validation: check character by character as user types
      // If confirmPassword has any value, compare it with password
      if (confirmPassword.value !== null && confirmPassword.value !== undefined && confirmPassword.value !== '') {
        if (password.value !== confirmPassword.value) {
          return { passwordMismatch: true };
        }
      }
      
      return null;
    }
    
    // If this is called as a form-level validator
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    
    if (!password || !confirmPassword) {
      return null;
    }
    
    // Real-time validation: check character by character as user types
    // If either field has a value, they must match
    if (confirmPassword.value !== null && confirmPassword.value !== undefined && confirmPassword.value !== '') {
      if (password.value !== confirmPassword.value) {
        return { passwordMismatch: true };
      }
    }
    
    return null;
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.UserList);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  getUserGroupLabel(value: string): string {
    const group = this.availableUserGroups.find(g => g.value === value);
    return group ? group.label : value;
  }

  saveUser(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const userRequest: UserRequest = {
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      email: formValue.email,
      password: this.isAddMode ? formValue.password : (formValue.password || ''), // Required in add mode, optional in edit mode
      userGroups: formValue.userGroups || [],
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.userService.createUser(userRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: UserResponse) => {
          this.toastr.success('User created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.UserList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create user request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      userRequest.userId = this.userId;
      this.userService.updateUser(this.userId, userRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: UserResponse) => {
          this.toastr.success('User updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.UserList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update user request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  private getUser(): void {
    this.userService.getUserByGuid(this.userId).pipe(take(1),
    finalize(() => { this.removeLoadItem('user') })).subscribe({
      next: (response: UserResponse) => {
        this.user = response;
        this.buildForm();
        this.setupPasswordValidation();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load user info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  private populateForm(): void {
    if (this.user && this.form) {
      // Normalize userGroups - convert numeric values or enum names to match our dropdown values
      const normalizeGroup = (group: string | number): string | null => {
        const groupStr = String(group).trim();
        const groupNum = typeof group === 'number' ? group : parseInt(groupStr, 10);
        
        // Check if it's a numeric value and convert to enum name
        if (!isNaN(groupNum) && groupNum > 0) {
          const enumKey = UserGroups[groupNum];
          if (enumKey && enumKey !== 'Unknown') {
            return enumKey;
          }
        }
        
        // Check if it matches an enum name directly (case-sensitive first)
        if (this.availableUserGroups.some(available => available.value === groupStr)) {
          return groupStr;
        }
        
        // Try case-insensitive match
        const matched = this.availableUserGroups.find(available => 
          available.value.toLowerCase() === groupStr.toLowerCase()
        );
        if (matched) {
          return matched.value;
        }
        
        return null;
      };
      
      const validUserGroups = (this.user.userGroups || [])
        .map(normalizeGroup)
        .filter((group): group is string => group !== null);
      
      // Use setValue for the userGroups array to ensure it's properly set
      this.form.patchValue({
        firstName: this.user.firstName,
        lastName: this.user.lastName,
        email: this.user.email,
        password: '', // Don't populate password in edit mode
        confirmPassword: '', // Don't populate confirm password in edit mode
        isActive: this.user.isActive
      });
      
      // Set userGroups separately to ensure the array is properly set
      this.form.get('userGroups')?.setValue(validUserGroups);
     }
  }

  get userGroups(): string[] {
    return this.form.get('userGroups')?.value || [];
  }

  get allUserGroupOptions(): string[] {
    return this.availableUserGroups.map(g => g.value);
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword = !this.hideConfirmPassword;
  }

  onConfirmPasswordBlur(): void {
    const confirmPasswordControl = this.form.get('confirmPassword');
    if (confirmPasswordControl) {
      confirmPasswordControl.markAsTouched();
      confirmPasswordControl.updateValueAndValidity();
      // Also trigger form-level validation
      this.form.updateValueAndValidity();
    }
  }

  get shouldShowPasswordHint(): boolean {
    const passwordControl = this.form.get('password');
    if (!passwordControl) return false;
    
    // Show hint only if password is invalid (not if it's valid)
    // This means if password fulfills criteria, no hint will be shown
    return passwordControl.invalid && (passwordControl.touched || passwordControl.value);
  }
}

