import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, map, of, skip, switchMap, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentResponse } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListTableComponent } from '../mobile-list-table/mobile-list-table.component';
import { MobileListRow } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-documents-page',
  imports: [MaterialModule, MobileListTableComponent],
  templateUrl: './mobile-documents-page.component.html',
  styleUrl: './mobile-documents-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDocumentsPageComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private documentService = inject(DocumentService);
  private officeService = inject(OfficeService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  rows: MobileListRow[] = [];
  columns: ColumnSet = {
    property: { displayAs: 'Property', maxWidth: '12ch', wrap: false },
    fileName: { displayAs: 'File Name', maxWidth: '40ch', wrap: false }
  };
  isPageReady = false;
  selectedOfficeId: number | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['documents']));
  destroy$ = new Subject<void>();

  //#region Mobile-Documents-Page
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.selectedOfficeId = officeId;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(() => {
      if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
        return;
      }
      this.reloadDocuments();
    });
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reloadDocuments(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
    this.loadDocuments();
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  openDocument(row: MobileListRow): void {
    const documentId = (row.id || '').trim();
    if (!documentId) {
      return;
    }
    void this.router.navigate(['/mobile', 'documents', documentId]);
  }
  //#endregion

  //#region Data Loading Methods
  loadDocuments(): void {
    this.resolveOfficeIds().pipe(take(1), switchMap(officeIds => officeIds.length === 0 ? of([] as DocumentResponse[]) : this.documentService.getDocuments({ officeIds }).pipe(take(1))), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'))).subscribe({
      next: documents => {
        this.rows = (documents || []).filter(document => document.isDeleted !== true && this.mappingService.matchesMobileOfficeScope(document.officeId, this.selectedOfficeId)).map(document => this.mapDocumentRow(document)).sort((left, right) => left['property'].localeCompare(right['property']) || left['fileName'].localeCompare(right['fileName']));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  private mapDocumentRow(document: DocumentResponse): MobileListRow {
    const extension = (document.fileExtension || '').trim().replace(/^\./, '');
    const name = (document.fileName || '').trim();
    const fileName = extension && !name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? `${name}.${extension}` : name;
    return {
      id: document.documentId,
      property: (document.propertyCode || '').trim(),
      fileName
    };
  }

  private resolveOfficeIds() {
    if (this.selectedOfficeId && this.selectedOfficeId > 0) {
      return of([this.selectedOfficeId]);
    }
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      return of<number[]>([]);
    }
    return this.officeService.getOffices(organizationId).pipe(
      map(offices => (offices || []).map(office => office.officeId).filter(id => id > 0))
    );
  }
  //#endregion
}
