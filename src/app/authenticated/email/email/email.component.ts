import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
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
export class EmailComponent implements OnInit {
  emailId = '';
  email: EmailResponse | null = null;
  isLoading = false;
  isServiceError = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private emailService: EmailService,
    private formatter: FormatterService,
    private authService: AuthService
  ) {}


  //#region Email
  ngOnInit(): void {
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      const id = paramMap.get('id');
      if (!id) {
        this.isServiceError = true;
        return;
      }

      this.emailId = id;
      this.loadEmail();
    });
  }

  loadEmail(): void {
    this.isLoading = true;
    this.isServiceError = false;

    this.emailService.getEmailByGuid(this.emailId).subscribe({
      next: (email) => {
        this.email = email;
        this.isLoading = false;
      },
      error: () => {
        this.email = null;
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }
  //#endregion

  //#region Utility Methods
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

  private getMaintenanceShellEmailTabIndex(): number {
    const isInspector = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    const showWorkOrdersTab = !isInspector;
    return showWorkOrdersTab ? 4 : 3;
  }

  back(): void {
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
      const params: string[] = ['tab=3'];
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
  //#endregion

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
}
