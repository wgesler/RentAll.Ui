import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, catchError, concatMap, filter, finalize, from, map, of, take, takeUntil, toArray} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CommonService } from '../../../services/common.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { StateFormListDisplay, StateFormResponse } from '../models/state-form.model';
import { StateFormService } from '../services/state-form.service';

@Component({
    standalone: true,
    selector: 'app-state-form-list',
    templateUrl: './state-form-list.component.html',
    styleUrls: ['./state-form-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StateFormListComponent implements OnInit, OnDestroy {
  @Output() stateFormSelected = new EventEmitter<string | number | null>();
  private stateFormService = inject(StateFormService);
  private commonService = inject(CommonService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  private readonly allStatesCode = 'XX';

  isServiceError: boolean = false;
  allStateForms: StateFormListDisplay[] = [];
  stateFormsDisplay: StateFormListDisplay[] = [];
  destroy$ = new Subject<void>();

  stateFormsDisplayedColumns: ColumnSet = {
    stateCode: { displayAs: 'State', maxWidth: '14ch' },
    formName: { displayAs: 'Form Name', maxWidth: '50ch' },
    hasDocument: { displayAs: 'Document', maxWidth: '16ch' },
    hasHtml: { displayAs: 'HTML', maxWidth: '12ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['stateForms']));

  //#region StateForm-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.loadStateForms();
  }

  addStateForm(): void {
    this.stateFormSelected.emit('new');
  }

  getStateForms(): void {
    this.loadStateForms();
  }

  goToStateForm(stateForm: StateFormListDisplay): void {
    if (!stateForm?.stateFormId) {
      return;
    }
    this.stateFormSelected.emit(stateForm.stateFormId);
  }

  deleteStateForm(stateForm: StateFormListDisplay): void {
    if (!stateForm?.stateFormId) {
      return;
    }

    this.stateFormService.deleteStateForm(stateForm.stateFormId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('State form deleted successfully', CommonMessage.Success);
        this.getStateForms();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  loadStateForms(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'stateForms');
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.loadStateFormsByStates(cachedStates);
      return;
    }

    this.commonService.loadStates();
    this.commonService.getStates().pipe(
      map(states => (states || []).filter(state => !!state)),
      filter(states => states.length > 0),
      take(1)
    ).subscribe({
      next: (states) => this.loadStateFormsByStates(states),
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
        this.markViewForCheck();
      }
    });
  }

  loadStateFormsByStates(states: string[]): void {
    const normalizedStates = [this.allStatesCode, ...(states || [])]
      .map(state => String(state || '').trim().toUpperCase())
      .filter((state, index, array) => state.length === 2 && array.indexOf(state) === index);

    if (normalizedStates.length === 0) {
      this.allStateForms = [];
      this.applyFilters();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      this.markViewForCheck();
      return;
    }

    from(normalizedStates).pipe(
      concatMap(stateCode => this.stateFormService.getStateForms(stateCode).pipe(
        take(1),
        catchError(() => of([] as StateFormResponse[]))
      )),
      toArray(),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      })
    ).subscribe({
      next: (responsesByState: StateFormResponse[][]) => {
        const allResponses = responsesByState.flat();
        const mapped = this.mappingService.mapStateForms(allResponses);
        this.allStateForms = mapped.sort((a, b) => {
          if (a.stateCode === this.allStatesCode && b.stateCode !== this.allStatesCode) {
            return -1;
          }
          if (a.stateCode !== this.allStatesCode && b.stateCode === this.allStatesCode) {
            return 1;
          }
          const stateSort = a.stateCode.localeCompare(b.stateCode);
          return stateSort !== 0 ? stateSort : a.formName.localeCompare(b.formName);
        });
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  applyFilters(): void {
    this.stateFormsDisplay = this.allStateForms;
  }

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
