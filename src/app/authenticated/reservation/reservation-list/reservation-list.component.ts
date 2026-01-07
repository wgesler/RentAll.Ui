import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { ReservationResponse, ReservationListDisplay } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-reservation-list',
  templateUrl: './reservation-list.component.html',
  styleUrls: ['./reservation-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ReservationListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allReservations: ReservationListDisplay[] = [];
  reservationsDisplay: ReservationListDisplay[] = [];
  contacts: ContactResponse[] = [];
  properties: PropertyResponse[] = [];

  reservationsDisplayedColumns: ColumnSet = {
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationStatus': { displayAs: 'Status', maxWidth: '20ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '25ch' },
    'arrivalDate': { displayAs: 'Arrival Date', maxWidth: '20ch' },
    'departureDate': { displayAs: 'Departure Date', maxWidth: '20ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['reservations', 'properties']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public reservationService: ReservationService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private contactService: ContactService,
    private propertyService: PropertyService) {
  }

  ngOnInit(): void {
    this.loadContacts();
    this.loadProperties();
  }

  addReservation(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Reservation, ['new']));
  }

  getReservations(): void {
    // Only call if not already loading/loaded
    const currentSet = this.itemsToLoad$.value;
    if (!currentSet.has('reservations')) {
      return; // Already loaded or loading
    }

    this.reservationService.getReservations().pipe(take(1), finalize(() => { this.removeLoadItem('reservations'); })).subscribe({
      next: (response: ReservationResponse[]) => {
        this.allReservations = this.mappingService.mapReservations(response, this.contacts, this.properties);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Reservations', CommonMessage.ServiceError);
        }
        this.removeLoadItem('reservations');
      }
    });
  }

  deleteReservation(reservation: ReservationListDisplay): void {
    if (confirm(`Are you sure you want to delete this reservation?`)) {
      this.reservationService.deleteReservation(reservation.reservationId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Reservation deleted successfully', CommonMessage.Success);
          // Remove from local arrays instead of reloading
          this.allReservations = this.allReservations.filter(r => r.reservationId !== reservation.reservationId);
          this.applyFilters();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete reservation. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete reservation', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToReservation(event: ReservationListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]));
  }

  // Data Load Methods
  loadContacts(): void {
    this.contactService.getAllContacts().pipe(filter((contacts: ContactResponse[]) => contacts && contacts.length > 0), take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
        // Try to get reservations if properties are also loaded
        if (this.properties.length > 0) {
          this.getReservations();
        }
      },
      error: (err: HttpErrorResponse) => {
        // Contacts are handled globally, just handle gracefully
        this.contacts = [];
        // Try to get reservations if properties are also loaded
        if (this.properties.length > 0) {
          this.getReservations();
        }
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getProperties().pipe(take(1), finalize(() => { this.removeLoadItem('properties'); })).subscribe({
      next: (properties: PropertyResponse[]) => {
        this.properties = properties;
        // Try to get reservations if contacts are also loaded
        if (this.contacts.length > 0) {
          this.getReservations();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.properties = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load properties. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('properties');
        // Try to get reservations even if properties failed
        if (this.contacts.length > 0) {
          this.getReservations();
        }
      }
    });
  }

  // Filtering Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.reservationsDisplay = this.showInactive
      ? this.allReservations
      : this.allReservations.filter(reservation => reservation.isActive === true);
  }

  // Utility Methods
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
}

