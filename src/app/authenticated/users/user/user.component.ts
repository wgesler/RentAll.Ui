import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Inject, Optional } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, Subscription, BehaviorSubject, Observable, map, filter, forkJoin, of } from 'rxjs';
import { UserService } from '../services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { UserResponse, UserRequest } from '../models/user.model';
import { UserGroups, getUserGroup } from '../models/user-type';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { OrganizationListService } from '../../organizations/services/organization-list.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface UserDialogData {
  userId: string;
  isDialog?: boolean;
  selfEdit?: boolean;
}

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss'
})

export class UserComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  userId: string;
  user: UserResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  isDialog: boolean = false;
  selfEdit: boolean = false;
  hideCurrentPassword: boolean = true;
  hidePassword: boolean = true;
  hideConfirmPassword: boolean = true;
  availableUserGroups: { value: string, label: string }[] = [];
  organizations: OrganizationResponse[] = [];
  organizationsSubscription: Subscription;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['user']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public userService: UserService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private organizationListService: OrganizationListService,
    private officeService: OfficeService,
    private authService: AuthService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData?: UserDialogData,
    @Optional() private dialogRef?: MatDialogRef<UserComponent>
  ) {
    // Check if component is opened in a dialog
    this.isDialog = !!dialogData?.isDialog;
    this.selfEdit = !!dialogData?.selfEdit;
    if (this.isDialog && dialogData?.userId) {
      this.userId = dialogData.userId;
      this.isAddMode = false;
    }
  }

  //#region User
  ngOnInit(): void {
    this.initializeUserGroups();
    this.loadOrganizations();
    this.loadOffices();
    
    // If opened in dialog, use dialog data
    if (this.isDialog && this.userId) {
      this.buildForm();
      this.setupPasswordValidation();
      this.getUser();
    } else {
      // Otherwise, use route params (existing behavior)
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.userId = paramMap.get('id');
          this.isAddMode = this.userId === 'new';
          if (this.isAddMode) {
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'user');
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
  }

  getUser(): void {
    this.userService.getUserByGuid(this.userId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'user'); })).subscribe({
      next: (response: UserResponse) => {
        this.user = response;
        this.buildForm();
        this.setupPasswordValidation();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  saveUser(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    // Use getRawValue() to include disabled form controls
    const formValue = this.form.getRawValue();
    
    // Check if password change is being made in selfEdit mode
    let passwordChangeRequest: Observable<any> | null = null;
    if (this.selfEdit) {
      const currentPassword = formValue.currentPassword?.trim() || '';
      const newPassword = formValue.password?.trim() || '';
      const confirmPassword = formValue.confirmPassword?.trim() || '';
      const passwordControl = this.form.get('password');
      const confirmPasswordControl = this.form.get('confirmPassword');
      
      // Only send password change if all fields are provided and valid
      if (currentPassword !== '' && newPassword !== '' && confirmPassword !== '' &&
          passwordControl?.valid && confirmPasswordControl?.valid && 
          newPassword === confirmPassword) {
        passwordChangeRequest = this.authService.updatePassword(currentPassword, newPassword);
      }
    }

    // Build user request (excluding password fields for selfEdit mode)
    const userRequest: UserRequest = {
      organizationId: formValue.organizationId,
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      email: formValue.email,
      password: this.isAddMode ? formValue.password : (formValue.password || ''), // Required in add mode, optional in edit mode
      userGroups: formValue.userGroups || [],
      officeAccess: formValue.officeAccess || [],
      isActive: formValue.isActive
    };

    // For selfEdit mode, don't send password in user update
    if (this.selfEdit && !this.isAddMode) {
      userRequest.password = '';
    }

    if (this.isAddMode) {
      this.userService.createUser(userRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: UserResponse) => {
          this.toastr.success('User created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.isDialog && this.dialogRef) {
            this.dialogRef.close(true);
          } else {
            this.router.navigateByUrl(RouterUrl.UserList);
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    } else {
      userRequest.userId = this.userId;
      
      // Check if there are any user updates (compare with original user data)
      const hasUserUpdates = this.user && (
        userRequest.firstName !== this.user.firstName ||
        userRequest.lastName !== this.user.lastName ||
        userRequest.email !== this.user.email ||
        JSON.stringify(userRequest.userGroups) !== JSON.stringify(this.user.userGroups) ||
        JSON.stringify(userRequest.officeAccess) !== JSON.stringify(this.user.officeAccess) ||
        userRequest.isActive !== this.user.isActive ||
        userRequest.organizationId !== this.user.organizationId
      );

      // Handle password change and user update
      if (this.selfEdit) {
        const requests: Observable<any>[] = [];
        
        if (passwordChangeRequest) {
          requests.push(passwordChangeRequest);
        }
        
        if (hasUserUpdates) {
          requests.push(this.userService.updateUser(userRequest));
        }

        if (requests.length === 0) {
          // No changes to save
          this.isSubmitting = false;
          return;
        }

        // Execute all requests
        forkJoin(requests).pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            const messages = [];
            if (passwordChangeRequest) messages.push('Password updated');
            if (hasUserUpdates) messages.push('User information updated');
            this.toastr.success(messages.join(' and ') + ' successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
            if (this.isDialog && this.dialogRef) {
              this.dialogRef.close(true);
            } else {
              this.router.navigateByUrl(RouterUrl.UserList);
            }
          },
          error: (err: HttpErrorResponse) => {
            if (err.status === 404) {
              // Handle not found error if business logic requires
            }
          }
        });
      } else {
        // Regular admin update
        this.userService.updateUser(userRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: (response: UserResponse) => {
            this.toastr.success('User updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
            if (this.isDialog && this.dialogRef) {
              this.dialogRef.close(true);
            } else {
              this.router.navigateByUrl(RouterUrl.UserList);
            }
          },
          error: (err: HttpErrorResponse) => {
            if (err.status === 404) {
              // Handle not found error if business logic requires
            }
          }
        });
      }
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizations(): void {
    this.organizationsSubscription = this.organizationListService.getOrganizations().subscribe({
      next: (organizations) => {
        this.organizations = organizations || [];
      },
      error: (err: HttpErrorResponse) => {
        // Organizations are handled globally, just handle gracefully
      }
    });
  }

  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.filterOfficesByOrganization();
      });
    });
  }
  //#endregion

  //#region Form methods
  buildForm(): void {
    const passwordValidators = this.isAddMode 
      ? [Validators.required, this.passwordStrengthValidator] 
      : [this.passwordStrengthValidator];
    
    const confirmPasswordValidators = this.isAddMode 
      ? [Validators.required, this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)] 
      : [this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)];
    
    const formControls: any = {
      organizationId: new FormControl('', [Validators.required]),
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', passwordValidators),
      confirmPassword: new FormControl('', confirmPasswordValidators),
      userGroups: new FormControl([], [Validators.required, this.userGroupsRequiredValidator]),
      officeAccess: new FormControl([]),
      isActive: new FormControl(true)
    };

    // Add currentPassword field for selfEdit mode
    if (this.selfEdit) {
      formControls.currentPassword = new FormControl('', []);
      // In selfEdit mode, if currentPassword is provided, new password becomes required
      // This will be handled via conditional validation
    }

    this.form = this.fb.group(formControls, { validators: this.passwordMatchValidator });
    
    // Add conditional validation for selfEdit mode: if currentPassword is provided, password and confirmPassword are required
    if (this.selfEdit) {
      this.form.get('currentPassword')?.valueChanges.subscribe(() => {
        const currentPassword = this.form.get('currentPassword')?.value;
        const passwordControl = this.form.get('password');
        const confirmPasswordControl = this.form.get('confirmPassword');
        if (currentPassword && currentPassword.trim() !== '') {
          passwordControl?.setValidators([Validators.required, this.passwordStrengthValidator]);
          confirmPasswordControl?.setValidators([Validators.required, this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)]);
        } else {
          passwordControl?.setValidators([this.passwordStrengthValidator]);
          confirmPasswordControl?.setValidators([this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)]);
        }
        passwordControl?.updateValueAndValidity({ emitEvent: false });
        confirmPasswordControl?.updateValueAndValidity({ emitEvent: false });
      });
    }
    
    // Reload offices when organization changes
    this.form.get('organizationId')?.valueChanges.subscribe(() => {
      this.filterOfficesByOrganization();
      // Clear office access when organization changes
      this.form.get('officeAccess')?.setValue([]);
    });
  }

  populateForm(): void {
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
        organizationId: this.user.organizationId,
        firstName: this.user.firstName,
        lastName: this.user.lastName,
        email: this.user.email,
        password: '', // Don't populate password in edit mode
        confirmPassword: '', // Don't populate confirm password in edit mode
        isActive: this.user.isActive
      });
      
      // Set userGroups separately to ensure the array is properly set
      this.form.get('userGroups')?.setValue(validUserGroups);
      
      // Set officeAccess - normalize to array of numbers
      const officeAccess = this.user.officeAccess || [];
      const officeAccessNumbers = Array.isArray(officeAccess) 
        ? officeAccess.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id))
        : [];
      this.form.get('officeAccess')?.setValue(officeAccessNumbers);
     }
  }
  //#endregion
  
  //#region Filter & Formatting
  filterOfficesByOrganization(): void {
    // Get organization from form if available, otherwise from logged-in user
    const organizationId = this.form?.get('organizationId')?.value || this.authService.getUser()?.organizationId;
    
    if (organizationId) {
      const filteredOffices = this.offices.filter(office => 
        office.organizationId === organizationId && office.isActive
      );
      this.availableOffices = this.mappingService.mapOfficesToDropdown(filteredOffices);
    } else {
      // If no organization selected, show all active offices (fallback)
      this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices.filter(office => office.isActive));
    }
  }

  initializeUserGroups(): void {
    this.availableUserGroups = Object.keys(UserGroups)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .filter(key => UserGroups[key] !== UserGroups.Unknown) // Exclude Unknown
      .map(key => ({
        value: key,
        label: this.formatUserGroupLabel(key)
      }));
  }

  formatUserGroupLabel(enumKey: string): string {
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }

  getOrganizationName(): string {
    if (!this.user?.organizationId) {
      return 'N/A';
    }
    const org = this.organizations.find(o => o.organizationId === this.user.organizationId);
    return org?.name || 'N/A';
  }

  getOfficeAccessNames(): string {
    if (!this.user?.officeAccess || this.user.officeAccess.length === 0) {
      return 'None';
    }
    const officeIds = this.user.officeAccess.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
    const officeNames = officeIds
      .map(id => {
        const office = this.offices.find(o => o.officeId === id);
        return office?.name;
      })
      .filter(name => name !== undefined);
    return officeNames.length > 0 ? officeNames.join(', ') : 'None';
  }
  //#endregion

  //#region User Group Helpers
  userGroupsRequiredValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || !Array.isArray(value) || value.length === 0) {
      return { userGroupsRequired: true };
    }
    return null;
  }

  getUserGroupLabel(value: string): string {
    const group = this.availableUserGroups.find(g => g.value === value);
    return group ? group.label : value;
  }

  get userGroups(): string[] {
    return this.form.get('userGroups')?.value || [];
  }

  get allUserGroupOptions(): string[] {
    return this.availableUserGroups.map(g => g.value);
  }
  //#endregion

  //#region Password Helpers
  setupPasswordValidation(): void {
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

  toggleCurrentPasswordVisibility(): void {
    this.hideCurrentPassword = !this.hideCurrentPassword;
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
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    if (this.organizationsSubscription) {
      this.organizationsSubscription.unsubscribe();
    }
    this.itemsToLoad$.complete();
  }

  back(): void {
    if (this.isDialog && this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.router.navigateByUrl(RouterUrl.UserList);
    }
  }
  //#endregion
}

