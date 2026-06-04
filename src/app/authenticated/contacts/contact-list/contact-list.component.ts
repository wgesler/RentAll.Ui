import { CommonModule } from "@angular/common";
import { Clipboard } from "@angular/cdk/clipboard";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, finalize, switchMap, take, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { EntityType } from '../models/contact-enum';
import { ContactListDisplay, ContactRequest, ContactResponse } from '../models/contact.model';
import { ContactService } from '../services/contact.service';
import { LeadsService } from '../../leads/services/leads.service';

@Component({
    standalone: true,
    selector: 'app-contact-list',
    templateUrl: './contact-list.component.html',
    styleUrls: ['./contact-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, TitleBarSelectComponent, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class ContactListComponent implements OnInit, OnDestroy, OnChanges {
  readonly EntityType = EntityType;
  @Input() entityTypeId?: number;
  @Input() officeId: number | null = null;
  @Input() showInactive: boolean = false;
  @Input() onlyOwnerNotReady: boolean = false;
  @Input() tabIndex?: number;
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() showInactiveChange = new EventEmitter<boolean>();
  @Output() openContact = new EventEmitter<{ contactId: string; copyFrom?: string; entityTypeId?: number; tabIndex?: number; ownerLeadId?: number | null; officeId?: number | null }>();

  allContacts: ContactListDisplay[] = [];
  contactsDisplay: ContactListDisplay[] = [];

  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  user: any;
  isAdmin = false;
  organizationId: string = '';

  hasInitialLoad: boolean = false;
  canEditIsActiveCheckbox = false;
  isInOwnerMode = false;
  isOwnerAdmin = false;
  private readonly baseColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false },
    'contactCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural' },
    'companyName': { displayAs: 'Company', maxWidth: '30ch' },
    'fullName': { displayAs: 'Contact', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '20ch' }
  };

  private readonly ownerColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false },
    'contactCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural' },
    'fullName': { displayAs: 'Contact', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'propertyCodesDisplay': { displayAs: 'Properties', maxWidth: '20ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '20ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['contacts']));
  destroy$ = new Subject<void>();

  constructor(
    private clipboard: Clipboard,
    public contactService: ContactService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private leadsService: LeadsService,
    private authService: AuthService,
    private navigationContextService: NavigationContextService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private cdr: ChangeDetectorRef) {
  }

  //#region Contact-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.setIsActiveCheckboxEditability();
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    if (this.entityTypeId === undefined || this.entityTypeId === null) {
      this.loadOffices();
    }
    this.loadContacts();
    this.navigationContextService.getIsInOwnerMode().pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.isInOwnerMode = value;
      this.markViewForCheck();
    });

  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityTypeId']) {
      const newEntityTypeId = changes['entityTypeId'].currentValue;
      const previousEntityTypeId = changes['entityTypeId'].previousValue;
      
      if (previousEntityTypeId === undefined || newEntityTypeId !== previousEntityTypeId) {
        this.applyFilters();
      }
    }
    
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;

      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.resolveOfficeScope(newOfficeId);
        this.markViewForCheck();
      }
    }

    if (changes['showInactive'] && !changes['showInactive'].firstChange) {
      this.applyFilters();
    }

  }

  addContact(): void {
    this.openContact.emit({
      contactId: 'new',
      entityTypeId: this.entityTypeId ?? undefined,
      tabIndex: this.tabIndex
    });
  }

  deleteContact(contact: ContactListDisplay): void {
    this.contactService.deleteContact(contact.contactId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Contact deleted successfully', CommonMessage.Success);
      },
      error: () => {}
    });
  }

  goToContact(event: ContactListDisplay): void {
    const contactId = String(event?.contactId || '').trim();
    if (!contactId) {
      return;
    }
    const eventOfficeId = Number(event?.officeId);
    const rowOfficeId = Number(this.allContacts.find(contact => contact.contactId === event?.contactId)?.officeId);
    const resolvedOfficeId = Number.isFinite(eventOfficeId) && eventOfficeId > 0
      ? eventOfficeId
      : rowOfficeId;
    const eventOwnerLeadId = Number(event?.ownerLeadId);
    const rowOwnerLeadId = Number(this.allContacts.find(contact => contact.contactId === event?.contactId)?.ownerLeadId);
    const resolvedOwnerLeadId = Number.isFinite(eventOwnerLeadId) && eventOwnerLeadId > 0
      ? eventOwnerLeadId
      : rowOwnerLeadId;
    if (this.isInOwnerMode) {
      if (Number.isFinite(resolvedOwnerLeadId) && resolvedOwnerLeadId > 0) {
        this.openContact.emit({
          contactId,
          entityTypeId: this.entityTypeId ?? undefined,
          tabIndex: this.tabIndex,
          ownerLeadId: resolvedOwnerLeadId,
          officeId: Number.isFinite(resolvedOfficeId) && resolvedOfficeId > 0 ? resolvedOfficeId : null
        });
        return;
      }
      this.contactService.getContactByGuid(contactId).pipe(take(1)).subscribe({
        next: contact => {
          const ownerLeadId = Number(contact.ownerLeadId);
          this.openContact.emit({
            contactId,
            entityTypeId: this.entityTypeId ?? undefined,
            tabIndex: this.tabIndex,
            ownerLeadId: Number.isFinite(ownerLeadId) && ownerLeadId > 0 ? ownerLeadId : null,
            officeId: Number.isFinite(Number(contact.officeId)) && Number(contact.officeId) > 0 ? Number(contact.officeId) : null
          });
        },
        error: () => {
          this.openContact.emit({
            contactId,
            entityTypeId: this.entityTypeId ?? undefined,
            tabIndex: this.tabIndex,
            ownerLeadId: null,
            officeId: Number.isFinite(resolvedOfficeId) && resolvedOfficeId > 0 ? resolvedOfficeId : null
          });
        }
      });
      return;
    }
    this.openContact.emit({
      contactId,
      entityTypeId: this.entityTypeId ?? undefined,
      tabIndex: this.tabIndex,
      ownerLeadId: resolvedOwnerLeadId ?? null,
      officeId: Number.isFinite(resolvedOfficeId) && resolvedOfficeId > 0 ? resolvedOfficeId : null
    });
  }

  copyContact(event: ContactListDisplay): void {
    this.openContact.emit({
      contactId: 'new',
      copyFrom: event.contactId,
      entityTypeId: this.entityTypeId ?? undefined,
      tabIndex: this.tabIndex
    });
  }

  copyOwnerFormLink(event: ContactListDisplay): void {
    const immediateOwnerLeadId = Number(event?.ownerLeadId);
    if (Number.isFinite(immediateOwnerLeadId) && immediateOwnerLeadId > 0) {
      this.copyOwnerFormShareUrl(immediateOwnerLeadId, Number(event?.officeId));
      return;
    }

    const contactId = String(event?.contactId || '').trim();
    if (!contactId) {
      this.toastr.error('Unable to determine owner link for this contact.', CommonMessage.Error);
      return;
    }

    this.contactService.getContactByGuid(contactId).pipe(take(1)).subscribe({
      next: contact => {
        const resolvedOwnerLeadId = Number(contact?.ownerLeadId);
        if (!Number.isFinite(resolvedOwnerLeadId) || resolvedOwnerLeadId <= 0) {
          this.toastr.error('This owner contact is not linked to an owner lead.', CommonMessage.Error);
          return;
        }
        this.copyOwnerFormShareUrl(resolvedOwnerLeadId, Number(contact?.officeId));
      },
      error: () => {
        this.toastr.error('Unable to determine owner link for this contact.', CommonMessage.Error);
      }
    });
  }

  onContactCheckboxChange(event: ContactListDisplay): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as any)?.__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as any)?.__previousCheckboxValue === true;
    const nextValue = (event as any)?.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyContactIsActiveValue(event.contactId, nextValue);

    this.contactService.getContactByGuid(event.contactId).pipe(
      take(1),
      switchMap((contact: ContactResponse) => this.contactService.updateContact(this.buildContactIsActiveUpdateRequest(contact, nextValue)).pipe(take(1))),
      finalize(() => {
        this.applyFilters();
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Contact updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyContactIsActiveValue(event.contactId, previousValue);
        this.toastr.error('Unable to update contact.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.showInactiveChange.emit(this.showInactive);
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.allContacts;
    
    if (!this.showInactive) {
      filtered = filtered.filter(contact => contact.isActive === true);
    }

    if (this.entityTypeId !== undefined && this.entityTypeId !== null) {
      filtered = filtered.filter(contact => contact.entityTypeId === this.entityTypeId);
    }

    if (this.onlyOwnerNotReady && this.entityTypeId === EntityType.Owner) {
      filtered = filtered.filter(contact => contact.isOwnerReady !== true);
    }

    const scopeOfficeId = this.officeId ?? this.selectedOffice?.officeId ?? null;
    if (scopeOfficeId != null) {
      filtered = filtered.filter(contact => {
        const officeAccess = (contact.officeAccess || []).map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);
        if (officeAccess.length > 0) {
          return officeAccess.includes(scopeOfficeId);
        }
        return Number(contact.officeId) === scopeOfficeId;
      });
    }

    this.contactsDisplay = filtered;
  }

  onOfficeChange(): void {
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get selectedOfficeId(): number | null {
    return this.selectedOffice?.officeId ?? null;
  }

  get contactsDisplayedColumns(): ColumnSet {
    return this.entityTypeId === EntityType.Owner ? this.ownerColumns : this.baseColumns;
  }

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.selectedOffice = officeId == null
      ? null
      : this.offices.find(office => office.officeId === officeId) || null;
    this.onOfficeChange();
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.offices.length > 0
      ? this.utilityService.resolveSelectedOfficeById(this.offices, officeId)
      : null;
    this.applyFilters();
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.syncContactsFromCache(contacts || []);
        });
      },
      error: () => {
        this.allContacts = [];
        this.contactsDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  private syncContactsFromCache(contacts: ContactResponse[]): void {
    this.allContacts = this.mappingService.mapContacts(contacts);
    this.applyFilters();
    this.hasInitialLoad = true;
    this.markViewForCheck();
  }

  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(office => office.isActive);
          this.showOfficeDropdown = this.offices.length > 1;
          this.resolveOfficeScope(this.officeId);
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(null);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Dynamic List Methods
  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.baseColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
    this.ownerColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  buildContactIsActiveUpdateRequest(contact: ContactResponse, isActive: boolean): ContactRequest {
    return this.mappingService.mapContactResponseToUpdateRequest(contact, { isActive });
  }

  applyContactIsActiveValue(contactId: string, isActive: boolean): void {
    for (const contact of this.allContacts) {
      if (contact.contactId === contactId) {
        contact.isActive = isActive;
        break;
      }
    }
    this.applyFilters();
  }

  copyOwnerFormShareUrl(ownerLeadId: number, fallbackOfficeId?: number | null): void {
    this.leadsService.getOwnerLeadById(ownerLeadId).pipe(take(1)).subscribe({
      next: ownerLead => {
        const officeId = Number(ownerLead?.officeId);
        const resolvedOfficeId = Number.isFinite(officeId) && officeId > 0
          ? officeId
          : (Number.isFinite(Number(fallbackOfficeId)) && Number(fallbackOfficeId) > 0 ? Number(fallbackOfficeId) : null);
        const propertyCode = String(ownerLead?.propertyCode || '').trim().toUpperCase();
        this.leadsService.createOwnerFormShareLink(ownerLeadId).pipe(take(1)).subscribe({
          next: (response) => {
            const shareUrl = this.leadsService.getPublicOwnerFormUrl(response.token, {
              officeId: resolvedOfficeId,
              propertyCode,
              propertyOffice: String(ownerLead?.propertyOffice || '').trim()
            });
            const copied = this.clipboard.copy(shareUrl);
            if (copied) {
              this.toastr.success('Owner form link copied to clipboard.', CommonMessage.Success);
              return;
            }
            this.toastr.error('Unable to copy owner form link.', CommonMessage.Error);
          },
          error: () => {
            this.toastr.error('Unable to generate owner form share link.', CommonMessage.Error);
          }
        });
      },
      error: () => {
        this.toastr.error('Unable to generate owner form share link.', CommonMessage.Error);
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

