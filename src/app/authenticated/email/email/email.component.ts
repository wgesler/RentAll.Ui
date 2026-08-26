import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { AuthService } from '../../../services/auth.service';
import { MaterialModule } from '../../../material.module';
import { EmailAddress, EmailResponse } from '../models/email.model';
import { EmailService } from '../services/email.service';
import { hasInspectorRole } from '../../shared/access/role-access';

@Component({
  standalone: true,
  selector: 'app-email',
  imports: [CommonModule, MaterialModule],
  templateUrl: './email.component.html',
  styleUrl: './email.component.scss'
})
export class EmailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() emailId: string | null = null;
  @Input() embeddedInEmailShell = false;
  @Output() backEvent = new EventEmitter<void>();

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private emailService = inject(EmailService);
  private formatter = inject(FormatterService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);

  currentEmailId = '';
  email: EmailResponse | null = null;
  isLoading = false;
  isServiceError = false;
  destroy$ = new Subject<void>();

  //#region Email
  ngOnInit(): void {
    if (this.emailId != null && this.emailId !== '') {
      this.initializeEmail(this.emailId);
      return;
    }

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((paramMap: ParamMap) => {
      this.initializeEmail(paramMap.get('id'));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['emailId'] && !changes['emailId'].firstChange) {
      this.initializeEmail(changes['emailId'].currentValue);
    }
  }

  initializeEmail(id: string | null | undefined): void {
    const nextId = String(id || '').trim();
    if (!nextId) {
      this.currentEmailId = '';
      this.email = null;
      this.isLoading = false;
      this.isServiceError = true;
      return;
    }

    if (nextId === this.currentEmailId && this.email) {
      return;
    }

    this.currentEmailId = nextId;
    this.loadEmail();
  }

  loadEmail(): void {
    this.isLoading = true;
    this.isServiceError = false;
    this.email = null;

    this.emailService.getEmailByGuid(this.currentEmailId).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoading = false;
      })
    ).subscribe({
      next: (email) => {
        this.email = email;
        this.isServiceError = false;
      },
      error: () => {
        this.email = null;
        this.isServiceError = true;
      }
    });
  }

  formatRecipients(recipients: EmailAddress[] | undefined): string {
    if (!recipients || recipients.length === 0) {
      return '';
    }

    return recipients
      .map(recipient => {
        const email = recipient?.email || '';
        const name = recipient?.name || '';
        if (name && email) {
          return `${name}<${email}>`;
        }

        return email || name;
      })
      .filter(Boolean)
      .join('; ');
  }
  //#endregion

  //#region Get Methods
  get formattedCreatedOn(): string {
    return this.formatter.formatDateTimeString(this.email?.createdOn) || (this.email?.createdOn || '');
  }

  get toRecipientsLine(): string {
    return this.formatRecipients(this.email?.toRecipients);
  }

  get ccRecipientsLine(): string {
    return this.formatRecipients(this.email?.ccRecipients);
  }

  get bccRecipientsLine(): string {
    return this.formatRecipients(this.email?.bccRecipients);
  }

  get fromRecipientLine(): string {
    const from = this.email?.fromRecipient;
    if (!from?.email && !from?.name) {
      return '';
    }

    if (from.name && from.email) {
      return `${from.name}<${from.email}>`;
    }

    return from.email || from.name || '';
  }

  get attachmentDocumentId(): string {
    return (this.email?.documentId || this.email?.attachmentDocumentId || '').trim();
  }

  getMaintenanceShellEmailTabIndex(): number {
    const isInspector = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    const showWorkOrdersTab = !isInspector;
    return showWorkOrdersTab ? 4 : 3;
  }
  //#endregion

  //#region Utility Methods
  openAttachment(): void {
    const documentId = this.attachmentDocumentId;
    if (!documentId) {
      this.toastr.warning('No document is linked to this attachment.', CommonMessage.Error);
      return;
    }

    this.router.navigate([RouterUrl.replaceTokens(RouterUrl.DocumentView, [documentId])], { queryParams: { returnTo: 'emailDetail', emailId: this.currentEmailId } });
  }

  back(): void {
    if (this.embeddedInEmailShell) {
      this.backEvent.emit();
      return;
    }

    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];

    if (returnTo === 'reservationTab') {
      const reservationId = queryParams['reservationId'];
      if (reservationId) {
        const params: string[] = ['tab=email', `reservationId=${reservationId}`];
        const officeId = queryParams['officeId'];
        if (officeId !== null && officeId !== undefined && officeId !== '') {
          params.push(`officeId=${officeId}`);
        }
        const reservationUrl = `${RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])}?${params.join('&')}`;
        this.router.navigateByUrl(reservationUrl);
        return;
      }
    }

    if (returnTo === 'accountingTab') {
      const params: string[] = ['tab=0'];
      const officeId = queryParams['officeId'];
      const reservationId = queryParams['reservationId'];
      const companyId = queryParams['companyId'];
      if (officeId !== null && officeId !== undefined && officeId !== '') {
        params.push(`officeId=${officeId}`);
      }
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }
      if (companyId) {
        params.push(`companyId=${companyId}`);
      }
      this.router.navigateByUrl(`${RouterUrl.AccountingList}?${params.join('&')}`);
      return;
    }

    if (returnTo === 'propertyTab') {
      const propertyId = queryParams['propertyId'];
      if (propertyId) {
        const params: string[] = ['tab=email'];
        const reservationId = queryParams['reservationId'];
        const officeId = queryParams['officeId'];
        if (reservationId) {
          params.push(`reservationId=${reservationId}`);
        }
        if (officeId !== null && officeId !== undefined && officeId !== '') {
          params.push(`officeId=${officeId}`);
        }
        const propertyUrl = `${RouterUrl.replaceTokens(RouterUrl.Property, [propertyId])}?${params.join('&')}`;
        this.router.navigateByUrl(propertyUrl);
        return;
      }
    }

    if (returnTo === 'maintenanceTab') {
      const propertyId = queryParams['propertyId'];
      if (propertyId) {
        const params: string[] = [`tab=${this.getMaintenanceShellEmailTabIndex()}`];
        const reservationId = queryParams['reservationId'];
        const officeId = queryParams['officeId'];
        if (reservationId) {
          params.push(`reservationId=${reservationId}`);
        }
        if (officeId !== null && officeId !== undefined && officeId !== '') {
          params.push(`officeId=${officeId}`);
        }
        const maintenanceUrl = `${RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId])}?${params.join('&')}`;
        this.router.navigateByUrl(maintenanceUrl);
        return;
      }
    }

    this.router.navigateByUrl(RouterUrl.EmailList);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
