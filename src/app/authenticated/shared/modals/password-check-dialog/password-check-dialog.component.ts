import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';

export interface PasswordCheckDialogData {
  title?: string;
  message?: string;
  hint?: string;
  confirmLabel?: string;
}

export interface PasswordCheckDialogResult {
  password: string;
}

@Component({
  standalone: true,
  selector: 'app-password-check-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './password-check-dialog.component.html',
  styleUrl: './password-check-dialog.component.scss'
})
export class PasswordCheckDialogComponent {
  data = inject<PasswordCheckDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<PasswordCheckDialogComponent, PasswordCheckDialogResult | undefined>>(MatDialogRef);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);

  isSubmitting = false;

  readonly form = this.fb.group({
    password: ['', Validators.required]
  });

  get title(): string {
    return this.data.title?.trim() || 'Password Check';
  }

  get confirmLabel(): string {
    return this.data.confirmLabel?.trim() || 'Confirm';
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.isSubmitting) {
      return;
    }

    const password = String(this.form.get('password')?.value || '').trim();
    if (!password) {
      this.form.get('password')?.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.authService.confirmPassword(password).pipe(
      take(1),
      finalize(() => { this.isSubmitting = false; })
    ).subscribe({
      next: isConfirmed => {
        if (!isConfirmed) {
          this.toastr.error('Password confirmation failed.', CommonMessage.Error);
          return;
        }

        this.dialogRef.close({ password });
      },
      error: () => {
        this.toastr.error('Password confirmation failed.', CommonMessage.Error);
      }
    });
  }
}
