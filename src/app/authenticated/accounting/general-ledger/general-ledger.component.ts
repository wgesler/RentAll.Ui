
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, filter, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { CompanyService } from '../../companies/services/company.service';
import { UtilityService } from '../../../services/utility.service';

@Component({
    selector: 'app-general-ledger',
    imports: [MaterialModule, FormsModule],
    templateUrl: './general-ledger.component.html',
    styleUrls: ['./general-ledger.component.scss']
})
export class GeneralLedgerComponent implements OnInit, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Input() companyId: string | null = null; // Input to accept companyId from parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  @Output() companyIdChange = new EventEmitter<string | null>(); // Emit company changes to parent
  
  selectedOfficeId: number | null = null;
  selectedReservationId: string | null = null;
  selectedCompany: CompanyResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  companies: CompanyResponse[] = [];
  availableCompanies: { value: CompanyResponse, label: string }[] = [];
  officesSubscription?: Subscription;
  reservationsSubscription?: Subscription;
  companiesSubscription?: Subscription;
  showInactive: boolean = false;
  showOfficeDropdown: boolean = true;

  constructor(
    private officeService: OfficeService,
    private mappingService: MappingService,
    private reservationService: ReservationService,
    private companyService: CompanyService,
    private utilityService: UtilityService
  ) {}

  //#region General-Ledger
  ngOnInit(): void {
    this.loadOffices();
    this.loadReservations();
    this.loadCompanies();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.selectedOfficeId = this.officeId;
      }
    });
  }

  onAdd(): void {
  }
  //#endregion

  //#region Form Response methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.selectedOfficeId = newOfficeId;
          this.filterCompanies();
          this.filterReservations();
        }
      }
    }

    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      if (this.reservations.length > 0) {
        this.selectedReservationId = newReservationId;
      }
    }

    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      if (this.companies.length > 0) {
        this.selectedCompany = newCompanyId
          ? this.companies.find(c => c.companyId === newCompanyId && (!this.selectedOfficeId || c.officeId === this.selectedOfficeId)) || null
          : null;
        this.filterReservations();
      }
    }
  }
   
  onOfficeChange(): void {
    this.officeIdChange.emit(this.selectedOfficeId);
    this.filterCompanies();
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompany?.companyId || null);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
  }

  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: (allOffices: OfficeResponse[]) => {
          this.offices = allOffices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          
          if (this.officeId !== null && this.officeId !== undefined) {
            this.selectedOfficeId = this.officeId;
          }
          
          // Keep General Ledger defaults as All Offices.
          this.showOfficeDropdown = true;
        },
        error: () => {
          this.offices = [];
        }
      });
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadCompanies(): void {
    this.companyService.getCompanies().pipe(take(1)).subscribe({
      next: (companies) => {
        this.companies = companies || [];
        this.filterCompanies();
      },
      error: () => {
        this.companies = [];
        this.availableCompanies = [];
      }
    });
  }

  filterCompanies(): void {
    const filteredCompanies = this.selectedOfficeId
      ? this.companies.filter(c => c.officeId === this.selectedOfficeId && c.isActive)
      : this.companies.filter(c => c.isActive);

    this.availableCompanies = filteredCompanies.map(c => ({
      value: c,
      label: `${c.companyCode || ''} - ${c.name}`.trim()
    }));

    if (this.selectedCompany && !filteredCompanies.some(c => c.companyId === this.selectedCompany?.companyId)) {
      this.selectedCompany = null;
      this.companyIdChange.emit(null);
    }

    if (this.companyId && !this.selectedCompany) {
      const matchingCompany = filteredCompanies.find(c => c.companyId === this.companyId) || null;
      if (matchingCompany) {
        this.selectedCompany = matchingCompany;
      }
    }
  }

  filterReservations(): void {
    let filteredReservations = this.selectedOfficeId
      ? this.reservations.filter(r => r.officeId === this.selectedOfficeId)
      : this.reservations;

    if (this.selectedCompany?.companyId) {
      const selectedCompanyId = this.selectedCompany.companyId;
      filteredReservations = filteredReservations.filter(r => {
        const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null };
        const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? null;
        return reservationEntityId === selectedCompanyId;
      });
    }

    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));

    if (this.selectedReservationId && !filteredReservations.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }

    if (this.reservationId && !this.selectedReservationId) {
      const matchingReservation = filteredReservations.find(r => r.reservationId === this.reservationId) || null;
      if (matchingReservation) {
        this.selectedReservationId = matchingReservation.reservationId;
      }
    }
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.reservationsSubscription?.unsubscribe();
    this.companiesSubscription?.unsubscribe();
  }
  //#endregion
}
