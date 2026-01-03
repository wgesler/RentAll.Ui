import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { ContactResponse, ContactListDisplay } from '../models/contact.model';
import { ContactService } from '../services/contact.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-contact-list',
  templateUrl: './contact-list.component.html',
  styleUrls: ['./contact-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ContactListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allContacts: ContactListDisplay[] = [];
  contactsDisplay: ContactListDisplay[] = [];

  contactsDisplayedColumns: ColumnSet = {
    'contactCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'contactType': { displayAs: 'Contact Type', maxWidth: '20ch' },
    'fullName': { displayAs: 'Name', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone' },
    'email': { displayAs: 'Email', maxWidth: '25ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public contactService: ContactService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
  }

  ngOnInit(): void {
    this.getContacts();
  }

  addContact(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, ['new']));
  }

  getContacts(): void {
    this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.removeLoadItem('contacts'); })).subscribe({
      next: (response: ContactResponse[]) => {
        this.allContacts = this.mappingService.mapContacts(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Contacts', CommonMessage.ServiceError);
        }
        this.removeLoadItem('contacts');
      }
    });
  }

  deleteContact(contact: ContactListDisplay): void {
    if (confirm(`Are you sure you want to delete ${contact.fullName}?`)) {
      this.contactService.deleteContact(contact.contactId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Contact deleted successfully', CommonMessage.Success);
          this.getContacts(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete contact. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete contact', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToContact(event: ContactListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]));
  }

  // Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.contactsDisplay = this.showInactive
      ? this.allContacts
      : this.allContacts.filter(contact => contact.isActive === true);
  }

  // Utility methods
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

