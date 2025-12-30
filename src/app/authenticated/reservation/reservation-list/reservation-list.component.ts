import { OnInit, Component } from '@angular/core';
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
import { take, finalize, filter } from 'rxjs';
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

export class ReservationListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  reservationsDisplayedColumns: ColumnSet = {
    'reservationCode': { displayAs: 'Reservation Code', maxWidth: '20ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property Code', maxWidth: '20ch', sortType: 'natural' },
    'reservationStatus': { displayAs: 'Status', maxWidth: '20ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '30ch' },
    'arrivalDate': { displayAs: 'Arrival Date', maxWidth: '20ch' },
    'departureDate': { displayAs: 'Departure Date', maxWidth: '20ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allReservations: ReservationListDisplay[] = [];
  reservationsDisplay: ReservationListDisplay[] = [];
  private contacts: ContactResponse[] = [];
  private properties: PropertyResponse[] = [];

  constructor(
    public reservationService: ReservationService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private contactService: ContactService,
    private propertyService: PropertyService) {
      this.itemsToLoad.push('reservations');
  }

  ngOnInit(): void {
    // Load contacts and properties in parallel
    this.contactService.getAllContacts().pipe(filter((contacts: ContactResponse[]) => contacts && contacts.length > 0), take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
        this.loadProperties();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation List Component - Error loading contacts:', err);
        this.contacts = [];
        this.loadProperties();
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getProperties().pipe(take(1)).subscribe({
      next: (properties: PropertyResponse[]) => {
        this.properties = properties;
        this.getReservations();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation List Component - Error loading properties:', err);
        this.properties = [];
        this.getReservations();
      }
    });
  }

  addReservation(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Reservation, ['new']));
  }

  getReservations(): void {
    this.reservationService.getReservations().pipe(take(1), finalize(() => { this.removeLoadItem('reservations') })).subscribe({
      next: (response: ReservationResponse[]) => {
        this.allReservations = this.mappingService.mapReservations(response, this.contacts, this.properties);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Reservations', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteReservation(reservation: ReservationListDisplay): void {
    if (confirm(`Are you sure you want to delete this reservation?`)) {
      this.reservationService.deleteReservation(reservation.reservationId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Reservation deleted successfully', CommonMessage.Success);
          this.getReservations();
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
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

