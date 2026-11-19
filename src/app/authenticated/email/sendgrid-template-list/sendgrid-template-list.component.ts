import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, forkJoin, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { SendGridTemplateResponse, SendGridTemplateRow } from '../models/sendgrid-template.model';
import { SendGridTemplateService } from '../services/sendgrid-template.service';

const SYSTEM_ORGANIZATION_ID = '99999999-9999-9999-9999-999999999999';

/**
 * Settings > Email: the SendGrid template ID each SendGrid-sent email uses, for the whole organization.
 */
@Component({
  standalone: true,
  selector: 'app-sendgrid-template-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './sendgrid-template-list.component.html',
  styleUrl: './sendgrid-template-list.component.scss'
})
export class SendGridTemplateListComponent implements OnChanges, OnDestroy {
  @Input() organizationId: string | null = null;
  @Input() organizationName = '';
  @Input() officeId: number | null = null;
  @Input() officeName = '';
  @Input() officeCount = 0;

  private sendGridTemplateService = inject(SendGridTemplateService);
  private toastr = inject(ToastrService);
  // The app only redraws marked views, so HTTP results must mark this one.
  private cdr = inject(ChangeDetectorRef);

  rows: SendGridTemplateRow[] = [];
  isLoading = false;
  private destroy$ = new Subject<void>();
  private loadToken = 0;

  // SendGrid templates apply to every office in the organization.
  readonly scopeOfficeId: number | null = null;

  get scopeLabel(): string {
    return this.organizationName;
  }

  get isSystemOrganization(): boolean {
    return (this.organizationId || '').toLowerCase() === SYSTEM_ORGANIZATION_ID;
  }

  ngOnChanges(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isDirty(row: SendGridTemplateRow): boolean {
    return row.templateId.trim() !== (row.saved?.templateId || '');
  }

  save(row: SendGridTemplateRow): void {
    const templateId = row.templateId.trim();
    if (!this.organizationId || row.isSaving || !this.isDirty(row)) {
      return;
    }
    if (!templateId) {
      this.clear(row);
      return;
    }
    if (!/^d-\S+$/i.test(templateId)) {
      this.toastr.error('Paste a SendGrid dynamic template ID. It starts with d-.');
      return;
    }

    row.isSaving = true;
    this.sendGridTemplateService.saveTemplate({
      organizationId: this.organizationId,
      officeId: this.scopeOfficeId,
      emailName: row.emailName,
      templateId
    }).pipe(take(1), finalize(() => { row.isSaving = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$)).subscribe({
      next: saved => {
        row.saved = saved;
        row.templateId = saved.templateId;
        this.toastr.success(`${row.displayName} template saved for ${this.scopeLabel}`);
      },
      error: (err: HttpErrorResponse) => this.toastr.error(this.errorMessage(err, `${row.displayName} template could not be saved.`))
    });
  }

  /** Removes the template saved for this scope; an office then falls back to the organization's. */
  clear(row: SendGridTemplateRow): void {
    if (!this.organizationId || row.isSaving) {
      return;
    }
    if (!row.saved) {
      row.templateId = '';
      return;
    }

    row.isSaving = true;
    this.sendGridTemplateService.deleteTemplate(row.saved.emailTemplateId, this.organizationId)
      .pipe(take(1), finalize(() => { row.isSaving = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$)).subscribe({
        next: () => {
          row.saved = null;
          row.templateId = '';
          this.toastr.success(`${row.displayName} template removed for ${this.scopeLabel}`);
        },
        error: (err: HttpErrorResponse) => this.toastr.error(this.errorMessage(err, `${row.displayName} template could not be removed.`))
      });
  }

  private load(): void {
    const organizationId = this.organizationId;
    const token = ++this.loadToken;
    if (!organizationId) {
      this.rows = [];
      return;
    }

    this.isLoading = true;
    forkJoin([
      this.sendGridTemplateService.getNames(),
      this.sendGridTemplateService.getTemplates(organizationId)
    ]).pipe(take(1), finalize(() => {
      if (token === this.loadToken) {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    }), takeUntil(this.destroy$)).subscribe({
      next: ([names, templates]) => {
        if (token !== this.loadToken) {
          return;
        }
        const officeId = this.scopeOfficeId;
        this.rows = (names || []).map(name => {
          const saved = this.find(templates, name.emailName, officeId);
          const inherited = officeId != null ? this.find(templates, name.emailName, null) : null;
          return {
            emailName: name.emailName,
            displayName: name.displayName,
            saved,
            templateId: saved?.templateId || '',
            inheritedTemplateId: inherited?.templateId || '',
            isSaving: false
          };
        });
      },
      error: () => {
        if (token === this.loadToken) {
          this.rows = [];
          this.toastr.error('SendGrid templates could not be loaded.');
        }
      }
    });
  }

  private find(templates: SendGridTemplateResponse[], emailName: string, officeId: number | null): SendGridTemplateResponse | null {
    return (templates || []).find(template =>
      template.emailName.toLowerCase() === emailName.toLowerCase()
      && (template.officeId ?? null) === officeId) || null;
  }

  private errorMessage(err: HttpErrorResponse, fallback: string): string {
    const body = err?.error as { message?: string; Message?: string } | string | null;
    return typeof body === 'string' && body ? body : String((body as { message?: string })?.message || (body as { Message?: string })?.Message || fallback);
  }
}
