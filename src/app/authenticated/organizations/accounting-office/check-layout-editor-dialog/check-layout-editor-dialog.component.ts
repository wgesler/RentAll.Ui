import { CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, from, of, switchMap, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { PdfThumbnailService } from '../../../../services/pdf-thumbnail.service';
import { CheckHtmlService } from '../../../accounting/services/check-html.service';
import { BankAccountResponse } from '../../models/bank.model';
import { FileDetails } from '../../../../shared/models/fileDetails';

export interface CheckLayoutEditorDialogData {
  officeId: number;
  bank: BankAccountResponse;
  /** Already-loaded stock from Accounting Office (same PDF shown in the Check Printing thumbnail). */
  checkStockFileDetails?: FileDetails | null;
  checkStockPreviewDataUrl?: string | null;
  checkStockPdfThumbnailUrl?: string | null;
}

interface LayoutField {
  className: string;
  label: string;
  sampleText: string;
  topIn: number;
  leftIn: number;
  widthIn: number;
  fontSizePx: number;
  textAlign: string;
  fontWeight: string;
  editable: boolean;
}

@Component({
  standalone: true,
  selector: 'app-check-layout-editor-dialog',
  imports: [CommonModule, MaterialModule, DragDropModule],
  templateUrl: './check-layout-editor-dialog.component.html',
  styleUrl: './check-layout-editor-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CheckLayoutEditorDialogComponent implements OnInit, OnDestroy {
  data = inject<CheckLayoutEditorDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<CheckLayoutEditorDialogComponent, string | false>>(MatDialogRef);
  private checkHtmlService = inject(CheckHtmlService);
  private pdfThumbnailService = inject(PdfThumbnailService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  private destroy$ = new Subject<void>();
  private readonly pxPerIn = 96;
  private readonly editableClassNames = ['field-date', 'field-payee', 'field-amount', 'field-words', 'field-memo'];

  readonly sampleByClass: Record<string, string> = {
    'field-date': '07/15/2026',
    'field-payee': "Brian's Construction",
    'field-amount': '$100.00',
    'field-words': 'One hundred and 00/100',
    'field-memo': 'Sample memo - JE-000000001',
    'stub-payee-vendor': "Brian's Construction",
    'stub-date-vendor': '07/15/2026',
    'stub-payee-company': "Brian's Construction",
    'stub-date-company': '07/15/2026'
  };

  isLoading = true;
  isSaving = false;
  stockImageUrl: string | null = null;
  displayScale = 0.72;
  fields: LayoutField[] = [];
  templateHtml = '';

  get pageWidthPx(): number {
    return 8.5 * this.pxPerIn * this.displayScale;
  }

  get pageHeightPx(): number {
    return 11 * this.pxPerIn * this.displayScale;
  }

  ngOnInit(): void {
    this.loadEditor();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFieldDragEnded(field: LayoutField, event: CdkDragEnd): void {
    if (!field.editable) {
      event.source.reset();
      return;
    }

    const scale = this.displayScale || 1;
    field.leftIn = Math.max(0, field.leftIn + event.distance.x / (this.pxPerIn * scale));
    field.topIn = Math.max(0, field.topIn + event.distance.y / (this.pxPerIn * scale));
    event.source.reset();
    this.cdr.markForCheck();
  }

  fieldTopPx(field: LayoutField): number {
    return field.topIn * this.pxPerIn * this.displayScale;
  }

  fieldLeftPx(field: LayoutField): number {
    return field.leftIn * this.pxPerIn * this.displayScale;
  }

  fieldWidthPx(field: LayoutField): number {
    return field.widthIn * this.pxPerIn * this.displayScale;
  }

  fieldFontSizePx(field: LayoutField): number {
    return field.fontSizePx * this.displayScale;
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onSave(): void {
    if (!this.templateHtml || this.isSaving) {
      return;
    }

    this.dialogRef.close(this.buildUpdatedTemplateHtml());
  }

loadEditor(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    const bankCheck = (this.data.bank.checkHtml || '').trim();
    const templateSource$ = this.checkHtmlService.hasMergeTokens(bankCheck)
      ? of(bankCheck)
      : this.checkHtmlService.getCheckHtmlByScope(this.data.officeId);

    templateSource$.pipe(
      switchMap(template => {
        this.templateHtml = template;
        this.fields = this.parseFields(template);
        const stockDetails = this.data.checkStockFileDetails || null;
        const stockPreviewUrl = (this.data.checkStockPreviewDataUrl || '').trim() || null;
        return this.loadStockBackground(stockDetails, stockPreviewUrl);
      }),
      finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      error: () => {
        this.toastr.error('Unable to load check layout editor.', CommonMessage.Error);
      }
    });
  }

loadStockBackground(fileDetails?: FileDetails | null, previewDataUrl?: string | null) {
    const parentThumbnail = (this.data.checkStockPdfThumbnailUrl || '').trim() || null;
    const imagePreview = this.resolveCheckStockImageDataUrl(fileDetails, previewDataUrl);
    const pdfDataUrl = this.resolveCheckStockPdfDataUrl(fileDetails, previewDataUrl);
    this.stockImageUrl = imagePreview || parentThumbnail;

    if (!pdfDataUrl) {
      return of(this.stockImageUrl);
    }

    return from(this.pdfThumbnailService.getFirstPageDataUrl(pdfDataUrl, 2550, 3)).pipe(
      switchMap(url => {
        if (url) {
          this.stockImageUrl = url;
          this.cdr.markForCheck();
          return of(url);
        }

        return from(this.pdfThumbnailService.getFirstPageDataUrl(pdfDataUrl, 1200, 2)).pipe(
          switchMap(fallback => {
            this.stockImageUrl = fallback || imagePreview || parentThumbnail;
            this.cdr.markForCheck();
            return of(this.stockImageUrl);
          })
        );
      })
    );
  }

resolveCheckStockImageDataUrl(fileDetails?: FileDetails | null, previewDataUrl?: string | null): string | null {
    const candidates = [previewDataUrl, fileDetails?.dataUrl, this.data.checkStockPdfThumbnailUrl];
    for (const candidate of candidates) {
      const value = (candidate || '').trim();
      if (/^data:image\//i.test(value)) {
        return value;
      }
    }
    return null;
  }

resolveCheckStockPdfDataUrl(fileDetails?: FileDetails | null, previewDataUrl?: string | null): string | null {
    const candidates = [previewDataUrl, fileDetails?.dataUrl];
    for (const candidate of candidates) {
      const value = (candidate || '').trim();
      if (value && this.pdfThumbnailService.decodePdfBytes(value)) {
        return value;
      }
    }

    const file = (fileDetails?.file || '').trim();
    if (!file) {
      return null;
    }

    const dataUrl = file.startsWith('data:')
      ? file
      : `data:${fileDetails?.contentType || 'application/pdf'};base64,${file}`;
    return this.pdfThumbnailService.decodePdfBytes(dataUrl) ? dataUrl : null;
  }

parseFields(template: string): LayoutField[] {
    const classNames = [
      'field-date', 'field-payee', 'field-amount', 'field-words', 'field-memo',
      'stub-payee-vendor', 'stub-date-vendor', 'stub-payee-company', 'stub-date-company'
    ];

    return classNames.map(className => {
      const body = this.extractCssRuleBody(template, className) || '';
      return {
        className,
        label: className.replace('field-', '').replace('stub-', 'stub '),
        sampleText: this.sampleByClass[className] || className,
        topIn: this.parseCssInch(body, 'top') ?? 0,
        leftIn: this.parseCssInch(body, 'left') ?? 0,
        widthIn: this.parseCssInch(body, 'width') ?? 1,
        fontSizePx: this.parseCssPx(body, 'font-size') ?? 11,
        textAlign: this.parseCssValue(body, 'text-align') || 'left',
        fontWeight: this.parseCssValue(body, 'font-weight') || 'normal',
        editable: this.editableClassNames.includes(className)
      };
    });
  }

buildUpdatedTemplateHtml(): string {
    let html = this.templateHtml;
    this.fields.filter(field => field.editable).forEach(field => {
      html = this.replaceCssPosition(html, field.className, field.topIn, field.leftIn);
    });
    return html;
  }

replaceCssPosition(html: string, className: string, topIn: number, leftIn: number): string {
    const pattern = new RegExp(`(\\.${this.escapeRegExp(className)}\\s*\\{)([^}]*)(\\})`, 'i');
    if (!pattern.test(html)) {
      return html;
    }

    return html.replace(pattern, (_match, open: string, body: string, close: string) => {
      let next = body
        .replace(/top\s*:\s*[^;]+;?/gi, '')
        .replace(/left\s*:\s*[^;]+;?/gi, '')
        .trim();
      next = `top: ${topIn.toFixed(2)}in; left: ${leftIn.toFixed(2)}in; ${next}`.replace(/\s+/g, ' ').trim();
      if (!next.endsWith(';')) {
        next += ';';
      }
      return `${open}${next}${close}`;
    });
  }

extractCssRuleBody(html: string, className: string): string | null {
    const match = html.match(new RegExp(`\\.${this.escapeRegExp(className)}\\s*\\{([^}]*)\\}`, 'i'));
    return match?.[1] ?? null;
  }

parseCssInch(body: string, prop: string): number | null {
    const match = body.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)in`, 'i'));
    return match ? Number(match[1]) : null;
  }

parseCssPx(body: string, prop: string): number | null {
    const match = body.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)px`, 'i'));
    return match ? Number(match[1]) : null;
  }

parseCssValue(body: string, prop: string): string | null {
    const match = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i'));
    return match?.[1]?.trim() || null;
  }

escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
