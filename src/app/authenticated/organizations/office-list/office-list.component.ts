import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeListDisplay, OfficeResponse } from '../models/office.model';
import { OfficeService } from '../services/office.service';

export interface OfficeCopyPayload {
  office: OfficeResponse;
  organizationId: string | null;
}

@Component({
    standalone: true,
    selector: 'app-office-list',
    templateUrl: './office-list.component.html',
    styleUrls: ['./office-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class OfficeListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Input() organizationId: string | null = null;
  @Output() officeSelected = new EventEmitter<string | number | null>();
  @Output() copyOfficeEvent = new EventEmitter<OfficeCopyPayload>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allOffices: OfficeListDisplay[] = [];
  officesDisplay: OfficeListDisplay[] = [];

  officesDisplayedColumns: ColumnSet = {
    'officeCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'address': { displayAs: 'Location', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'fax': { displayAs: 'Fax', maxWidth: '20ch' },
    'website': { displayAs: 'Website', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public officeService: OfficeService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private authService: AuthService
  ) {
  }

  //#region Office-List
  ngOnInit(): void {
    this.getOffices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['organizationId'] && !changes['organizationId'].firstChange) {
      this.getOffices();
    }
  }

  addOffice(): void {
    if (this.embeddedInSettings) {
      this.officeSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Office, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getOffices(): void {
    const orgId = (this.organizationId ?? this.authService.getUser()?.organizationId ?? '').trim();
    if (!orgId) {
      this.isServiceError = true;
      this.removeLoadItem('offices');
      return;
    }
    this.officeService.getOffices(orgId).pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
      next: (response: OfficeResponse[]) => {
        this.allOffices = this.mappingService.mapOffices(response);
        this.applyFilters();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.removeLoadItem('offices');
      }
    });
  }

  deleteOffice(office: OfficeListDisplay): void {
    this.officeService.deleteOffice(office.officeId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Office deleted successfully', CommonMessage.Success);
        this.getOffices();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToOffice(event: OfficeListDisplay): void {
    if (this.embeddedInSettings) {
      this.officeSelected.emit(event.officeId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Office, [event.officeId.toString()]);
      this.router.navigateByUrl(url);
    }
  }

  copyOffice(row: OfficeListDisplay): void {
    this.officeService.getOfficeById(row.officeId).pipe(take(1)).subscribe({
      next: (response: OfficeResponse) => {
        const copyData: OfficeResponse = { ...response, name: '' };
        if (this.embeddedInSettings) {
          this.copyOfficeEvent.emit({
            office: copyData,
            organizationId: this.organizationId ?? null
          });
        } else {
          const url = '/' + RouterUrl.replaceTokens(RouterUrl.Office, ['new']);
          this.router.navigateByUrl(url, { state: { copyFrom: copyData } });
        }
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Filter methods
  applyFilters(): void {
    this.officesDisplay = this.showInactive
      ? this.allOffices
      : this.allOffices.filter(office => office.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}


