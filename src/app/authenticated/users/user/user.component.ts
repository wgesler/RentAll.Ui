import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Inject, OnDestroy, OnInit, Optional } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, forkJoin, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { OrganizationListService } from '../../organizations/services/organization-list.service';
import { StartupPage, UserGroups } from '../models/user-enums';
import { UserRequest, UserResponse } from '../models/user.model';
import { UserService } from '../services/user.service';

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
  availableStartupPages: { value: number, label: string }[] = [];
  organizations: OrganizationResponse[] = [];
  organizationsSubscription: Subscription;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  
  // Profile picture properties
  isUploadingProfilePicture: boolean = false;
  fileName: string = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false;
  profilePath: string = null;
  originalprofilePath: string = null;

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
    this.initializeStartupPages();
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
        if (response.fileDetails && response.fileDetails.file) {
          this.fileDetails = response.fileDetails;
          this.hasNewFileUpload = false; 
        }
        
        if (response.profilePath) {
          this.profilePath = response.profilePath;
          this.originalprofilePath = response.profilePath; 
        }
        this.buildForm();
        this.setupPasswordValidation();
        // Use setTimeout to defer form population to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
          this.populateForm();
        }, 0);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
        }
      }
    });
  }

  saveUser(): void {
    // Get changePassword toggle value first
    const changePassword = this.form.get('changePassword')?.value || false;
    
    // If password toggle is off, ensure password fields have no validators and no errors
    if (!changePassword) {
      const passwordControl = this.form.get('password');
      const confirmPasswordControl = this.form.get('confirmPassword');
      const currentPasswordControl = this.form.get('currentPassword');
      
      // Clear any errors on password fields
      passwordControl?.setErrors(null);
      confirmPasswordControl?.setErrors(null);
      if (currentPasswordControl) {
        currentPasswordControl.setErrors(null);
      }
      
      // Clear form-level password mismatch error if it exists
      const formErrors = this.form.errors;
      if (formErrors && formErrors['passwordMismatch']) {
        const newFormErrors = { ...formErrors };
        delete newFormErrors['passwordMismatch'];
        this.form.setErrors(Object.keys(newFormErrors).length > 0 ? newFormErrors : null);
      }
      
      // Update validity
      passwordControl?.updateValueAndValidity({ emitEvent: false });
      confirmPasswordControl?.updateValueAndValidity({ emitEvent: false });
      if (currentPasswordControl) {
        currentPasswordControl.updateValueAndValidity({ emitEvent: false });
      }
      this.form.updateValueAndValidity({ emitEvent: false });
    } else {
      // When changePassword is ON, ensure form validation is up to date
      // This helps clear any stale form-level errors when passwords match
      this.form.updateValueAndValidity({ emitEvent: false });
    }
    
    // Check form validity
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    // Use getRawValue() to include disabled form controls
    const formValue = this.form.getRawValue();
    
    // Check if password change is being made in selfEdit mode - ONLY if toggle is enabled
    let passwordChangeRequest: Observable<any> | null = null;
    if (this.selfEdit && changePassword === true) {
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

    const passwordValue = changePassword && formValue.password?.trim() ? formValue.password.trim() : null;
    
    // Ensure startupPageId is a number
    const startupPageIdValue = formValue.startupPageId !== undefined && formValue.startupPageId !== null
      ? (typeof formValue.startupPageId === 'number' ? formValue.startupPageId : parseInt(String(formValue.startupPageId), 10))
      : 0;
    
    console.log('Form startupPageId value:', formValue.startupPageId);
    console.log('Sending startupPageId to API:', startupPageIdValue);
    
    const userRequest: UserRequest = {
      organizationId: formValue.organizationId,
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      email: formValue.email,
      password: (changePassword && passwordValue) ? passwordValue : null, // null if not changing password
      userGroups: formValue.userGroups || [],
      officeAccess: formValue.officeAccess || [],
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      profilePath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.profilePath,
      startupPageId: startupPageIdValue,
      isActive: formValue.isActive
    };
    
    console.log('UserRequest being sent:', userRequest);
    
    // For add mode, password is required if changePassword is enabled
    if (this.isAddMode && changePassword && !passwordValue) {
      this.form.get('password')?.markAsTouched();
      this.form.get('confirmPassword')?.markAsTouched();
      this.isSubmitting = false;
      return;
    }
    
    // For selfEdit mode, don't send password in user update (password change is handled separately)
    if (this.selfEdit && !this.isAddMode) {
      userRequest.password = null;
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
      // Also check for profile picture changes
      const hasProfilePictureChange = this.hasNewFileUpload || 
        (userRequest.fileDetails && this.user?.fileDetails?.file !== userRequest.fileDetails?.file) ||
        (userRequest.profilePath !== this.user?.profilePath);
      
      const hasUserUpdates = this.user ? (
        userRequest.firstName !== this.user.firstName ||
        userRequest.lastName !== this.user.lastName ||
        userRequest.email !== this.user.email ||
        JSON.stringify(userRequest.userGroups) !== JSON.stringify(this.user.userGroups) ||
        JSON.stringify(userRequest.officeAccess) !== JSON.stringify(this.user.officeAccess) ||
        userRequest.isActive !== this.user.isActive ||
        userRequest.organizationId !== this.user.organizationId ||
        hasProfilePictureChange
      ) : true; // If user data not loaded, assume there are updates to save

      // Handle password change and user update
      if (this.selfEdit) {
        const requests: Observable<any>[] = [];
        
        // Only add password change request if toggle is enabled and request was created
        if (changePassword === true && passwordChangeRequest) {
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
            // Only show password updated message if toggle was enabled and request was made
            if (changePassword === true && passwordChangeRequest) messages.push('Password updated');
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
        // Regular admin update - always save if form is valid (hasUserUpdates check is for selfEdit only)
        // For admin, we save regardless to ensure profile picture and other changes are saved
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
            this.toastr.error('Failed to update user', CommonMessage.Error, { timeOut: CommonTimeouts.Error });
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
    // Password fields are optional by default - validators will be set conditionally based on changePassword toggle
    const formControls: any = {
      organizationId: new FormControl({ value: '', disabled: this.selfEdit }, [Validators.required]),
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [this.passwordStrengthValidator]),
      confirmPassword: new FormControl('', [this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)]),
      userGroups: new FormControl([], [Validators.required, this.userGroupsRequiredValidator]),
      officeAccess: new FormControl({ value: [], disabled: this.selfEdit }, [Validators.required]),
      changePassword: new FormControl(this.isAddMode ? true : false), // Toggle to enable/require password fields - default to true in add mode
      fileUpload: new FormControl(null, { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      startupPageId: new FormControl(0, [Validators.required]),
      isActive: new FormControl(true)
    };

    // Add currentPassword field for selfEdit mode
    if (this.selfEdit) {
      formControls.currentPassword = new FormControl('', []);
    }

    // Create form without form-level password validator initially - we'll add it conditionally
    this.form = this.fb.group(formControls);
    
    // Setup changePassword toggle behavior
    this.form.get('changePassword')?.valueChanges.subscribe((changePassword: boolean) => {
      const passwordControl = this.form.get('password');
      const confirmPasswordControl = this.form.get('confirmPassword');
      const currentPasswordControl = this.form.get('currentPassword');
      
      if (changePassword) {
        passwordControl?.enable();
        confirmPasswordControl?.enable();
        if (currentPasswordControl) {
          currentPasswordControl.enable();
        }

        passwordControl?.setValidators([Validators.required, this.passwordStrengthValidator]);
        confirmPasswordControl?.setValidators([Validators.required, this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)]);
        if (this.selfEdit && currentPasswordControl) {
          currentPasswordControl.setValidators([Validators.required]);
        }
        
        // Add form-level password match validator when toggle is ON
        this.form.setValidators(this.passwordMatchValidator);
      } else {
        passwordControl?.disable();
        confirmPasswordControl?.disable();
        if (currentPasswordControl) {
          currentPasswordControl.disable();
        }
        
        passwordControl?.setValue('');
        confirmPasswordControl?.setValue('');
        if (currentPasswordControl) {
          currentPasswordControl.setValue('');
        }
        
        // Remove all validators when fields are disabled to prevent form validation errors
        passwordControl?.clearValidators();
        confirmPasswordControl?.clearValidators();
        if (currentPasswordControl) {
          currentPasswordControl.clearValidators();
        }
        
        this.form.clearValidators();
      }
      
      passwordControl?.updateValueAndValidity({ emitEvent: false });
      confirmPasswordControl?.updateValueAndValidity({ emitEvent: false });
      if (currentPasswordControl) {
        currentPasswordControl.updateValueAndValidity({ emitEvent: false });
      }
      this.form.updateValueAndValidity({ emitEvent: false });
    });
    
    // Initialize password fields based on changePassword toggle value
    // In add mode, changePassword defaults to true, so fields should be enabled
    const changePasswordValue = this.form.get('changePassword')?.value || false;
    if (!changePasswordValue) {
      const pwdControl = this.form.get('password');
      const confirmPwdControl = this.form.get('confirmPassword');
      const currentPwdControl = this.form.get('currentPassword');
      
      // Clear validators before disabling
      pwdControl?.clearValidators();
      confirmPwdControl?.clearValidators();
      if (currentPwdControl) {
        currentPwdControl.clearValidators();
      }
      
      // Remove form-level validator since toggle is OFF
      this.form.clearValidators();
      
      // Disable fields
      pwdControl?.disable();
      confirmPwdControl?.disable();
      if (currentPwdControl) {
        currentPwdControl.disable();
      }
      
      // Update validity after clearing validators and disabling
      pwdControl?.updateValueAndValidity({ emitEvent: false });
      confirmPwdControl?.updateValueAndValidity({ emitEvent: false });
      if (currentPwdControl) {
        currentPwdControl.updateValueAndValidity({ emitEvent: false });
      }
      
      // Update form-level validity
      this.form.updateValueAndValidity({ emitEvent: false });
    } else if (this.isAddMode) {
      // In add mode with changePassword true, ensure password fields are enabled and have validators
      const pwdControl = this.form.get('password');
      const confirmPwdControl = this.form.get('confirmPassword');
      
      pwdControl?.enable();
      confirmPwdControl?.enable();
      
      // Set required validators for add mode
      pwdControl?.setValidators([Validators.required, this.passwordStrengthValidator]);
      confirmPwdControl?.setValidators([Validators.required, this.passwordStrengthValidator, this.passwordMatchValidator.bind(this)]);
      
      // Add form-level password match validator
      this.form.setValidators(this.passwordMatchValidator);
      
      // Update validity
      pwdControl?.updateValueAndValidity({ emitEvent: false });
      confirmPwdControl?.updateValueAndValidity({ emitEvent: false });
      this.form.updateValueAndValidity({ emitEvent: false });
    }
    
    // Add conditional validation for selfEdit mode: if currentPassword is provided, password and confirmPassword are required
    // This is now handled by the changePassword toggle, but keeping for backward compatibility
    if (this.selfEdit) {
      this.form.get('currentPassword')?.valueChanges.subscribe(() => {
        // Only apply if changePassword is enabled
        if (this.form.get('changePassword')?.value) {
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
        }
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
        startupPageId: this.user.startupPageId ?? 0,
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

  initializeStartupPages(): void {
    this.availableStartupPages = Object.keys(StartupPage)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .map(key => ({
        value: StartupPage[key as keyof typeof StartupPage],
        label: this.formatStartupPageLabel(key)
      }));
  }

  formatStartupPageLabel(enumKey: string): string {
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
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
    // Skip validation if control is disabled
    if (control.disabled) {
      return null;
    }
    
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
      const changePassword = control.parent.get('changePassword');
      
      if (!password) {
        return null;
      }
      
      // Skip validation if changePassword toggle is off - this is the primary check
      if (!changePassword || !changePassword.value) {
        return null;
      }
      
      // Skip validation if fields are disabled or empty
      if (password.disabled || confirmPassword.disabled) {
        return null;
      }
      if (!password.value && !confirmPassword.value) {
        return null; // Both empty, no validation needed
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
    const changePassword = control.get('changePassword');
    
    if (!password || !confirmPassword) {
      return null;
    }
    
    // Skip validation if changePassword toggle is off - this is the primary check
    if (!changePassword || !changePassword.value) {
      return null;
    }
    
    // Skip validation if fields are disabled or empty
    if (password.disabled || confirmPassword.disabled) {
      return null;
    }
    if (!password.value && !confirmPassword.value) {
      return null; // Both empty, no validation needed
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

  //#region Profile Picture Methods
  uploadProfilePicture(event: Event): void {
    if (!this.form) return;
    this.isUploadingProfilePicture = true;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];

      this.fileName = file.name;
      this.form.patchValue({ fileUpload: file });
      this.form.get('fileUpload')?.updateValueAndValidity();
      this.profilePath = null; // Clear existing profile picture path when new file is selected
      this.hasNewFileUpload = true; // Mark that this is a new file upload

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '', dataUrl: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        // readAsDataURL returns a data URL (e.g., "data:image/png;base64,iVBORw0KG...")
        const dataUrl = fileReader.result as string;
        if (this.fileDetails) {
          this.fileDetails.dataUrl = dataUrl;
          // Extract base64 string from data URL for API upload
          // Format: "data:image/png;base64,iVBORw0KG..." -> extract part after comma
          const base64String = dataUrl.split(',')[1];
          this.fileDetails.file = base64String;
        }
        this.isUploadingProfilePicture = false;
      };
      fileReader.readAsDataURL(file);
    }
  }
  
  removeProfilePicture(): void {
    if (!this.form) return;
    this.profilePath = null;
    this.fileName = null;
    this.fileDetails = null;
    this.hasNewFileUpload = false; // Reset flag when profile picture is removed
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload')?.updateValueAndValidity();
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

