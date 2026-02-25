import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { DocumentService } from '../../documents/services/document.service';
import { EmailConfig } from '../../shared/base-document.component';
import { EmailCreateDraft } from '../models/email-create.model';
import { EmailService } from '../services/email.service';
import { EmailCreateDraftService } from '../services/email-create-draft.service';
import { sendDocumentEmail, splitEmailList } from '../utils/send-document-email';

@Component({
  selector: 'app-email-create',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './email-create.component.html',
  styleUrl: './email-create.component.scss'
})
export class EmailCreateComponent implements OnInit {
  draft: EmailCreateDraft | null = null;
  form: FormGroup = this.buildForm();
  isSending = false;
  isMissingDraft = false;
  private initialPlainTextContent = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private toastr: ToastrService,
    private draftService: EmailCreateDraftService,
    private documentService: DocumentService,
    private documentHtmlService: DocumentHtmlService,
    private emailService: EmailService
  ) {}

  ngOnInit(): void {
    const draft = this.draftService.getDraft();
    if (!draft) {
      this.isMissingDraft = true;
      return;
    }

    this.draft = draft;
    const initialPlainTextContent = draft.emailConfig.plainTextContent || this.htmlToPlainText(draft.emailConfig.htmlContent || '');
    this.initialPlainTextContent = initialPlainTextContent;

    this.form.patchValue({
      subject: draft.emailConfig.subject || '',
      toEmail: draft.emailConfig.toEmail || '',
      toName: draft.emailConfig.toName || '',
      fromEmail: draft.emailConfig.fromEmail || '',
      fromName: draft.emailConfig.fromName || '',
      ccEmails: (draft.emailConfig.ccEmails || []).join(', '),
      bccEmails: (draft.emailConfig.bccEmails || []).join(', '),
      plainTextContent: initialPlainTextContent
    });
  }

  get attachmentName(): string {
    return this.draft?.emailConfig.fileDetails?.fileName || 'document.pdf';
  }

  get toRecipientLine(): string {
    return this.formatAddressLine(this.form.get('toName')?.value, this.form.get('toEmail')?.value);
  }

  get fromRecipientLine(): string {
    return this.formatAddressLine(this.form.get('fromName')?.value, this.form.get('fromEmail')?.value);
  }

  async send(): Promise<void> {
    if (!this.draft) {
      this.isMissingDraft = true;
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.getRawValue();
    const plainTextBody = formValue.plainTextContent || '';
    const isBodyModified = this.isBodyChanged(plainTextBody);
    const emailConfig: EmailConfig = {
      ...this.draft.emailConfig,
      subject: (formValue.subject || '').trim(),
      toEmail: (formValue.toEmail || '').trim(),
      toName: (formValue.toName || '').trim(),
      fromEmail: (formValue.fromEmail || '').trim(),
      fromName: (formValue.fromName || '').trim(),
      ccEmails: splitEmailList(formValue.ccEmails || ''),
      bccEmails: splitEmailList(formValue.bccEmails || ''),
      plainTextContent: plainTextBody,
      htmlContent: isBodyModified ? '' : (this.draft.emailConfig.htmlContent || '')
    };

    if (!this.isValidDraft(this.draft, emailConfig)) {
      return;
    }

    this.isSending = true;
    try {
      await sendDocumentEmail(
        {
          documentService: this.documentService,
          documentHtmlService: this.documentHtmlService,
          emailService: this.emailService
        },
        this.draft.documentConfig,
        emailConfig
      );
      this.toastr.success('Email sent successfully.', 'Success');
      this.navigateBackAndClear();
    } catch {
      this.toastr.error(this.draft.emailConfig.errorMessage || 'Error sending email. Please try again.', 'Error');
    } finally {
      this.isSending = false;
    }
  }

  cancel(): void {
    this.navigateBackAndClear();
  }

  navigateBackAndClear(): void {
    const returnUrl = this.draft?.returnUrl || RouterUrl.EmailList;
    this.draftService.clearDraft();
    this.router.navigateByUrl(returnUrl);
  }

  buildForm(): FormGroup {
    return this.fb.group({
      subject: new FormControl('', [Validators.required]),
      toEmail: new FormControl('', [Validators.required, Validators.email]),
      toName: new FormControl('', [Validators.required]),
      fromEmail: new FormControl('', [Validators.required, Validators.email]),
      fromName: new FormControl('', [Validators.required]),
      ccEmails: new FormControl(''),
      bccEmails: new FormControl(''),
      plainTextContent: new FormControl('')
    });
  }

  formatAddressLine(name: string | null | undefined, email: string | null | undefined): string {
    const safeName = (name || '').trim();
    const safeEmail = (email || '').trim();
    if (safeName && safeEmail) {
      return `${safeName}<${safeEmail}>`;
    }

    return safeEmail || safeName || '';
  }

  htmlToPlainText(html: string): string {
    if (!html) {
      return '';
    }

    const normalized = html
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?>/gi, '')
      .replace(/<\s*\/p\s*>/gi, '\n\n')
      .replace(/<\s*\/div\s*>/gi, '\n')
      .replace(/<\s*\/li\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '- ');

    const text = normalized.replace(/<[^>]+>/g, '');
    const decoded = this.decodeHtmlEntities(text)
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const cleanedLines = decoded
      .split('\n')
      .map(line => line.replace(/[ \t]+/g, ' ').trim());

    return cleanedLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  decodeHtmlEntities(value: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');
    return doc.documentElement.textContent || '';
  }

  isBodyChanged(currentText: string): boolean {
    return this.normalizeForComparison(currentText) !== this.normalizeForComparison(this.initialPlainTextContent);
  }

  normalizeForComparison(value: string): string {
    return (value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .trim();
  }

  isValidDraft(draft: EmailCreateDraft, emailConfig: EmailConfig): boolean {
    if (!draft.documentConfig.previewIframeHtml) {
      this.toastr.warning('No preview available to email.', 'No Preview');
      return false;
    }

    if (!draft.documentConfig.organizationId || !draft.documentConfig.selectedOfficeId) {
      this.toastr.warning('Organization or Office not available', 'No Selection');
      return false;
    }

    if (!emailConfig.fromEmail || !emailConfig.fromName) {
      this.toastr.warning('Current user email sender information is not available.', 'No Sender');
      return false;
    }

    if (!emailConfig.toEmail || !emailConfig.toName) {
      this.toastr.warning('Recipient email information is missing.', 'No Email');
      return false;
    }

    return true;
  }
}
