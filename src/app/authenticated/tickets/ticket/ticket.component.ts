import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { FormatterService } from '../../../services/formatter-service';
import { getTicketStateTypes } from '../models/ticket-enum';
import { TicketRequest, TicketResponse } from '../models/ticket-models';
import { TicketService } from '../services/ticket.service';

@Component({
  standalone: true,
  selector: 'app-ticket',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './ticket.component.html',
  styleUrl: './ticket.component.scss'
})
export class TicketComponent implements OnInit, OnChanges, OnDestroy {
  @Input() id: string | number | null = null;
  @Input() embeddedInSettings: boolean = false;
  @Input() selectedPropertyIdFromShell: string | null = null;
  @Input() selectedOfficeIdFromShell: number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  @Output() propertySelectionChange = new EventEmitter<{ propertyId: string | null; officeId: number | null }>();

  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  ticket: TicketResponse | null = null;
  ticketCodeDisplay = '';
  form: FormGroup;
  ticketStateTypes = getTicketStateTypes();
  properties: PropertyListResponse[] = [];
  users: UserResponse[] = [];
  assigneeOptions: { userId: string; displayName: string }[] = [];
  selectedPropertyOfficeId: number | null = null;
  private isApplyingShellPropertySelection = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ticket', 'properties', 'users']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private ticketService: TicketService,
    private dialog: MatDialog,
    private propertyService: PropertyService,
    private userService: UserService,
    private formatterService: FormatterService
  ) {}

  //#region Ticket
  ngOnInit(): void {
    this.buildForm();
    this.loadProperties();
    this.loadUsers();
    this.setupPropertySelectionSync();
    if (this.embeddedInSettings) {
      this.initializeTicketById(this.id);
      return;
    }

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.initializeTicketById(params.get('id'));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].firstChange) {
      this.initializeTicketById(changes['id'].currentValue);
    }
    if (changes['selectedPropertyIdFromShell'] && !changes['selectedPropertyIdFromShell'].firstChange) {
      this.applyShellPropertySelection(changes['selectedPropertyIdFromShell'].currentValue ?? null);
    }
  }

  initializeTicketById(id: string | number | null): void {
    this.addLoadItem('ticket');
    this.isServiceError = false;
    this.isAddMode = id === 'new' || id === null || id === undefined;

    if (this.isAddMode) {
      this.ticket = null;
      this.ticketCodeDisplay = '';
      this.form.reset({
        propertyId: this.selectedPropertyIdFromShell ?? null,
        assigneeId: null,
        title: '',
        description: '',
        ticketStateTypeId: this.ticketStateTypes[0]?.value ?? 0,
        permissionToEnter: false,
        ownerContacted: false,
        confirmedWithTenant: false,
        followedUpWithOwner: false,
        workOrderCompleted: false,
        isActive: true
      }, { emitEvent: false });
      this.applyPropertySelection(this.selectedPropertyIdFromShell ?? null, true);
      this.emitPropertySelection();
      this.removeLoadItem('ticket');
      return;
    }

    const ticketId = Number(id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      this.isServiceError = true;
      this.itemsToLoad$.next(new Set());
      return;
    }

    this.ticketService.getTicketById(ticketId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.ticket = response;
        this.populateForm(response);
        this.removeLoadItem('ticket');
      },
      error: () => {
        const stateTicket = history.state?.['ticket'] as TicketResponse | undefined;
        if (stateTicket && Number(stateTicket.ticketId) === ticketId) {
          this.ticket = stateTicket;
          this.populateForm(stateTicket);
          this.removeLoadItem('ticket');
          return;
        }

        this.isServiceError = true;
        this.removeLoadItem('ticket');
      }
    });
  }

  saveTicket(): void {
    if (this.isSubmitting) {
      return;
    }
    this.form.updateValueAndValidity({ emitEvent: false });
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    let request: TicketRequest;
    try {
      request = this.buildTicketRequest();
    } catch {
      this.toastr.error('Unable to prepare ticket data for saving.', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const save$ = this.isAddMode
      ? this.ticketService.createTicket(request)
      : this.ticketService.updateTicket(request);

    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.ticket = response;
        this.ticketCodeDisplay = response.TicketCode || '';
        this.isSubmitting = false;
        this.toastr.success(
          this.isAddMode ? 'Ticket created successfully' : 'Ticket updated successfully',
          CommonMessage.Success,
          { timeOut: CommonTimeouts.Success }
        );
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: () => {
        this.isSubmitting = false;
        this.toastr.error('Unable to save ticket.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      propertyId: new FormControl<string | null>(null, [Validators.required]),
      assigneeId: new FormControl<string | null>(null),
      title: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      ticketStateTypeId: new FormControl(0, [Validators.required]),
      permissionToEnter: new FormControl(false),
      ownerContacted: new FormControl(false),
      confirmedWithTenant: new FormControl(false),
      followedUpWithOwner: new FormControl(false),
      workOrderCompleted: new FormControl(false),
      isActive: new FormControl(true)
    });
  }

  populateForm(ticket: TicketResponse): void {
    this.ticketCodeDisplay = ticket.TicketCode || '';
    const ticketAssigneeId = (ticket as unknown as { assigneeId?: string | null }).assigneeId ?? null;
    this.form.patchValue({
      propertyId: ticket.propertyId ?? null,
      assigneeId: ticketAssigneeId,
      title: ticket.Title || '',
      description: ticket.Description || '',
      ticketStateTypeId: ticket.ticketStateTypeId,
      permissionToEnter: ticket.permissionToEnter,
      ownerContacted: ticket.ownerContacted,
      confirmedWithTenant: ticket.confirmedWithTenant,
      followedUpWithOwner: ticket.followedUpWithOwner,
      workOrderCompleted: ticket.workOrderCompleted,
      isActive: ticket.IsActive
    }, { emitEvent: false });
    this.applyPropertySelection(ticket.propertyId ?? null);
    this.emitPropertySelection();
  }
  //#endregion

  //#region Utility Methods
  buildTicketRequest(): TicketRequest {
    const formValue = this.form.getRawValue();
    const existing = this.ticket;
    const selectedPropertyId = formValue.propertyId ? String(formValue.propertyId).trim() : null;
    const selectedOfficeId = this.selectedPropertyOfficeId ?? this.selectedOfficeIdFromShell ?? existing?.officeId ?? 0;
    const selectedPropertyCode = this.getPropertyCodeById(selectedPropertyId) ?? existing?.PropertyCode ?? null;
    const selectedAssigneeId = formValue.assigneeId ? String(formValue.assigneeId).trim() : null;

    return {
      ticketId: existing?.ticketId ?? 0,
      organizationId: existing?.organizationId || '',
      officeId: selectedOfficeId,
      officeName: existing?.officeName || '',
      propertyId: selectedPropertyId,
      PropertyCode: selectedPropertyCode,
      assigneeId: selectedAssigneeId,
      ReservationId: existing?.ReservationId ?? null,
      ReservationCode: existing?.ReservationCode ?? null,
      TicketCode: existing?.TicketCode || '',
      Title: String(formValue.title || '').trim(),
      Description: String(formValue.description || '').trim(),
      ticketStateTypeId: Number(formValue.ticketStateTypeId ?? 0),
      permissionToEnter: !!formValue.permissionToEnter,
      ownerContacted: !!formValue.ownerContacted,
      confirmedWithTenant: !!formValue.confirmedWithTenant,
      followedUpWithOwner: !!formValue.followedUpWithOwner,
      workOrderCompleted: !!formValue.workOrderCompleted,
      Notes: existing?.Notes
        ? existing.Notes.map(note => ({
            ticketNoteId: note.ticketNoteId,
            ticketId: note.ticketId,
            note: note.note,
            createdOn: note.createdOn,
            createdBy: note.createdBy,
            modifiedOn: note.modifiedOn,
            modifiedBy: note.modifiedBy
          }))
        : null,
      IsActive: !!formValue.isActive
    };
  }

  get activePropertyOptions(): { propertyId: string; propertyCode: string }[] {
    return this.properties.map(property => ({
      propertyId: property.propertyId,
      propertyCode: property.propertyCode || ''
    }));
  }

  get lastModifiedDisplay(): string {
    const modifiedOn = (this.ticket as unknown as { ModifiedOn?: string | null; modifiedOn?: string | null } | null);
    const modifiedOnValue = modifiedOn?.ModifiedOn ?? modifiedOn?.modifiedOn ?? null;
    if (modifiedOnValue) {
      return this.formatterService.formatDateString(modifiedOnValue) || '';
    }
    if (this.isAddMode) {
      return this.formatterService.dateOnly(new Date()) || '';
    }
    return '';
  }

  getPropertyCodeById(propertyId: string | null): string | null {
    if (!propertyId) {
      return null;
    }
    const property = this.properties.find(item => item.propertyId === propertyId);
    return property?.propertyCode ?? null;
  }

  onPropertyDropdownChange(value: string | null): void {
    this.applyPropertySelection(value);
    this.emitPropertySelection();
  }

  setupPropertySelectionSync(): void {
    this.form.get('propertyId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.isApplyingShellPropertySelection) {
        return;
      }
      const nextPropertyId = value == null || String(value).trim() === '' ? null : String(value);
      this.applyPropertySelection(nextPropertyId, true);
      this.emitPropertySelection();
    });
  }

  applyShellPropertySelection(propertyId: string | null): void {
    if (!this.form || !this.embeddedInSettings) {
      return;
    }
    const control = this.form.get('propertyId');
    const currentValue = control?.value == null || String(control.value).trim() === '' ? null : String(control.value);
    if (currentValue === propertyId) {
      return;
    }
    this.isApplyingShellPropertySelection = true;
    control?.setValue(propertyId, { emitEvent: false });
    this.applyPropertySelection(propertyId, true);
    this.isApplyingShellPropertySelection = false;
  }

  applyPropertySelection(propertyId: string | null, keepAssigneeIfValid: boolean = false): void {
    const normalizedPropertyId = propertyId == null || String(propertyId).trim() === '' ? null : String(propertyId);
    const property = this.properties.find(item => item.propertyId === normalizedPropertyId) || null;
    this.selectedPropertyOfficeId = property?.officeId ?? null;
    const officeId = this.selectedPropertyOfficeId ?? this.selectedOfficeIdFromShell;
    this.assigneeOptions = (this.users || [])
      .filter(user => user.isActive && officeId != null && (user.officeAccess || []).includes(officeId))
      .map(user => ({
        userId: user.userId,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    const currentAssigneeId = this.form.get('assigneeId')?.value == null ? null : String(this.form.get('assigneeId')?.value);
    const isCurrentAssigneeValid = !!currentAssigneeId && this.assigneeOptions.some(option => option.userId === currentAssigneeId);
    if (!keepAssigneeIfValid || !isCurrentAssigneeValid) {
      this.form.get('assigneeId')?.setValue(isCurrentAssigneeValid ? currentAssigneeId : null, { emitEvent: false });
    }
  }

  emitPropertySelection(): void {
    const propertyIdControlValue = this.form.get('propertyId')?.value;
    const propertyId = propertyIdControlValue == null || String(propertyIdControlValue).trim() === '' ? null : String(propertyIdControlValue);
    this.propertySelectionChange.emit({
      propertyId,
      officeId: this.selectedPropertyOfficeId
    });
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => this.removeLoadItem('properties'))).subscribe({
      next: properties => {
        this.properties = (properties || []).slice().sort((a, b) =>
          String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' })
        );
        const selectedPropertyId = this.form?.get('propertyId')?.value == null ? this.selectedPropertyIdFromShell : String(this.form.get('propertyId')?.value);
        this.applyPropertySelection(selectedPropertyId);
      },
      error: () => {
        this.properties = [];
      }
    });
  }

  loadUsers(): void {
    this.userService.getUsers().pipe(take(1), finalize(() => this.removeLoadItem('users'))).subscribe({
      next: users => {
        this.users = users || [];
        const selectedPropertyId = this.form?.get('propertyId')?.value == null ? this.selectedPropertyIdFromShell : String(this.form.get('propertyId')?.value);
        this.applyPropertySelection(selectedPropertyId, true);
      },
      error: () => {
        this.users = [];
      }
    });
  }

  removeLoadItem(key: string): void {
    const currentItems = this.itemsToLoad$.value;
    if (!currentItems.has(key)) {
      return;
    }
    const nextItems = new Set(currentItems);
    nextItems.delete(key);
    this.itemsToLoad$.next(nextItems);
  }

  addLoadItem(key: string): void {
    const currentItems = this.itemsToLoad$.value;
    if (currentItems.has(key)) {
      return;
    }
    const nextItems = new Set(currentItems);
    nextItems.add(key);
    this.itemsToLoad$.next(nextItems);
  }

  back(): void {
    this.backEvent.emit();
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.ticket?.officeId ?? null,
      propertyId: this.ticket?.propertyId ?? null,
      reservationId: this.ticket?.ReservationId ?? null,
      source: 'reservation'
    };
    this.dialog.open(AddAlertDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'add-alert-dialog-panel',
      data: dialogData
    });
  }

  canDeactivate(): boolean {
    if (this.embeddedInSettings || !this.form || !this.form.dirty) {
      return true;
    }

    return window.confirm('You have unsaved changes. Are you sure you want to leave this page?');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
