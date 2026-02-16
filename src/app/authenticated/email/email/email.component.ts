import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { EmailAddress, EmailResponse } from '../models/email.model';
import { EmailService } from '../services/email.service';

@Component({
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
    private formatter: FormatterService
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

  back(): void {
    this.router.navigateByUrl(RouterUrl.EmailList);
  }
  //#endregion

  private formatRecipients(recipients: EmailAddress[] | undefined): string {
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
