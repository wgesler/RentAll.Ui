import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TerminologyListDisplay } from '../models/terminology.model';
import { TerminologyService } from '../services/terminology.service';

@Component({
  standalone: true,
  selector: 'app-terminology-list',
  templateUrl: './terminology-list.component.html',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TerminologyListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Output() terminologySelected = new EventEmitter<string | number | null>();
  private terminologyService = inject(TerminologyService);
  private toastr = inject(ToastrService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);

  allTerminologies: TerminologyListDisplay[] = [];
  terminologiesDisplay: TerminologyListDisplay[] = [];
  terminologiesDisplayedColumns: ColumnSet = {
    'term': { displayAs: 'Term', maxWidth: '30ch' },
    'replacement': { displayAs: 'Replacement', maxWidth: '50ch' }
  };
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['terminologies']));
  destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.getTerminologies();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.applyFilters();
      this.markViewForCheck();
    }
  }

  addTerminology(): void {
    this.terminologySelected.emit('new');
  }

  getTerminologies(): void {
    this.terminologyService.ensureTerminologiesLoaded().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'terminologies'))).subscribe({
      next: response => {
        this.allTerminologies = this.mappingService.mapTerminologies(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 404) {
          this.toastr.error('Unable to load terminology.', CommonMessage.Error);
        }
        this.markViewForCheck();
      }
    });
  }

  deleteTerminology(terminology: TerminologyListDisplay): void {
    this.terminologyService.deleteTerminology(terminology.termId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Term deleted successfully', CommonMessage.Success);
        this.getTerminologies();
      },
      error: () => {
        this.toastr.error('Unable to delete term.', CommonMessage.Error);
      }
    });
  }

  goToTerminology(event: TerminologyListDisplay): void {
    this.terminologySelected.emit(event.termId);
  }

  applyFilters(): void {
    this.terminologiesDisplay = this.officeId == null
      ? this.allTerminologies
      : this.allTerminologies.filter(terminology => terminology.officeId === this.officeId);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
}
