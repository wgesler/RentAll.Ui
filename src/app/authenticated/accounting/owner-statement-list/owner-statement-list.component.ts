import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OwnerStatementListDisplay, OwnerStatementResponse, OwnerStatementSearchRequest } from '../models/owner-statement.model';
import { OwnerStatementService } from '../services/owner-statement.service';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './owner-statement-list.component.html',
  styleUrl: './owner-statement-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;

  isPageReady = false;
  isServiceError = false;
  ownerStatements: OwnerStatementResponse[] = [];
  ownerStatementsDisplay: OwnerStatementListDisplay[] = [];
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatements']));
  destroy$ = new Subject<void>();

  ownerStatementDisplayedColumns: ColumnSet = {
    propertyId: { displayAs: 'PropertyId', maxWidth: '20ch', wrap: false },
    propertyCode: { displayAs: 'Property Code', maxWidth: '16ch', wrap: false },
    ownerName: { displayAs: 'Owner Name', maxWidth: '24ch', wrap: false },
    income: { displayAs: 'Income', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right', sort: false },
    expenses: { displayAs: 'Expenses', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right', sort: false },
    balance: { displayAs: 'Balance', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };

  constructor(private ownerStatementService: OwnerStatementService, private mappingService: MappingService, private utilityService: UtilityService, private cdr: ChangeDetectorRef) {}

  //#region Owner Statement List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOwnerStatements();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchRequest'] && !changes['searchRequest'].firstChange) {
      this.loadOwnerStatements();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadOwnerStatements();
    }
  }
  //#endregion

  //#region Data Load Methods
  buildOwnerStatementSearchRequest(): OwnerStatementSearchRequest {
    return {
      officeIds: (this.searchRequest?.officeIds ?? []).filter(id => id > 0),
      propertyId: this.searchRequest?.propertyId ?? null,
      startDate: this.searchRequest?.startDate ?? null,
      endDate: this.searchRequest?.endDate ?? null
    };
  }

  loadOwnerStatements(): void {
    const request = this.buildOwnerStatementSearchRequest();
    if (request.officeIds.length === 0) {
      this.ownerStatements = [];
      this.ownerStatementsDisplay = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatements');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerStatements');
    this.ownerStatementService.searchOwnerStatements(request).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatements'))
    ).subscribe({
      next: statements => {
        this.ownerStatements = statements || [];
        this.ownerStatementsDisplay = this.mappingService.mapOwnerStatementDisplays(this.ownerStatements);
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.ownerStatements = [];
        this.ownerStatementsDisplay = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
