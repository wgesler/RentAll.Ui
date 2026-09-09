import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { EmailCreateComponent } from '../../email/email-create/email-create.component';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { resolveMobileReturnUrl } from '../mobile-email-nav';

@Component({
  standalone: true,
  selector: 'app-mobile-email-create-page',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './mobile-email-create-page.component.html',
  styleUrl: './mobile-email-create-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileEmailCreatePageComponent extends EmailCreateComponent {
  private mobileRouter = inject(Router);
  private mobileDraftService = inject(EmailCreateDraftService);
  private mobileToastr = inject(ToastrService);

  override navigateBackAndClear(): void {
    const returnUrl = resolveMobileReturnUrl(this.draft?.returnUrl);
    this.mobileDraftService.clearDraft();
    void this.mobileRouter.navigateByUrl(returnUrl);
  }

  override openAttachment(): void {
    this.mobileToastr.warning('Attachment preview is not available on mobile.', CommonMessage.Error);
  }

  backToMobile(): void {
    this.navigateBackAndClear();
  }
}
