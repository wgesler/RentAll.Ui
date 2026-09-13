import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes.tokens';
import { ReceiptSelection } from '../models/receipt.model';
import { ReceiptDraftComponent } from '../receipt-draft/receipt-draft.component';
import { ReceiptDraftsListComponent } from '../receipt-drafts-list/receipt-drafts-list.component';

@Component({
  standalone: true,
  selector: 'app-receipt-drafts-shell',
  imports: [CommonModule, MaterialModule, ReceiptDraftsListComponent, ReceiptDraftComponent],
  templateUrl: './receipt-drafts-shell.component.html',
  styleUrl: './receipt-drafts-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptDraftsShellComponent {
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  showDetail = false;
  selectedReceiptDraftId: string | null = null;
  listRefreshToken = 0;

  onDraftSelect(receiptDraftId: string): void {
    this.selectedReceiptDraftId = receiptDraftId;
    this.showDetail = true;
    this.cdr.markForCheck();
  }

  onAddDraft(): void {
    this.selectedReceiptDraftId = null;
    this.showDetail = true;
    this.cdr.markForCheck();
  }

  onBack(): void {
    this.showDetail = false;
    this.selectedReceiptDraftId = null;
    this.listRefreshToken += 1;
    this.cdr.markForCheck();
  }

  onSaved(receiptDraftId: string): void {
    this.selectedReceiptDraftId = receiptDraftId;
    this.listRefreshToken += 1;
    this.cdr.markForCheck();
  }

  onPromoted(selection: ReceiptSelection): void {
    this.showDetail = false;
    this.selectedReceiptDraftId = null;
    this.listRefreshToken += 1;

    const receiptId = (selection.receiptId || '').trim();
    const propertyId = (selection.propertyId || '').trim();
    if (!receiptId) {
      this.cdr.markForCheck();
      return;
    }

    void this.router.navigate(
      [`/${RouterUrl.MaintenanceList}`],
      {
        queryParams: {
          tab: 2,
          receiptId,
          ...(propertyId ? { propertyId } : {})
        }
      }
    );
    this.cdr.markForCheck();
  }
}
