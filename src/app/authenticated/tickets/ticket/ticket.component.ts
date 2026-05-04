import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { hasCompanyRole } from '../../shared/access/role-access';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { FormatterService } from '../../../services/formatter-service';
import { TicketStateType, getTicketStateTypes } from '../models/ticket-enum';
import { TicketNoteRequest, TicketResponse, TicketRequest } from '../models/ticket-models';
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
  @Input() selectedReservationIdFromShell: string | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  @Output() propertySelectionChange = new EventEmitter<{ propertyId: string | null; officeId: number | null; reservationId: string | null }>();
  @Output() officeSelectionInvalidOnSave = new EventEmitter<void>();

  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  isPageReady: boolean = false;
  form: FormGroup;

  organizationId = '';
  ticket: TicketResponse | null = null;
  currentAssignee: string | null = null;
  currentTicketStateTypeId: number = TicketStateType.caseCreated;
  ticketCodeDisplay = '';
  ticketStateTypes = getTicketStateTypes();

  properties: PropertyListResponse[] = [];
  users: UserResponse[] = [];
  agents: AgentResponse[] = [];
  assigneeOptions: { userId: string; displayName: string }[] = [];
  reservationAgentOptions: { agentId: string; displayName: string }[] = [];
  selectedPropertyOfficeId: number | null = null;

  isApplyingShellPropertySelection = false;
  reservationAgentSyncKey: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ticket', 'properties', 'users', 'agents']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private utilityService: UtilityService,
    private ticketService: TicketService,
    private dialog: MatDialog,
    private agentService: AgentService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private userService: UserService,
    private formatterService: FormatterService
  ) {}

  //#region Ticket
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() || '';

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.buildForm();
    this.loadProperties();
    this.loadUsers();
    this.loadAgents();
    this.setupPropertySelectionSync();
    if (this.embeddedInSettings) {
      this.getTicket(this.id);
      return;
    }

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.getTicket(params.get('id'));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].firstChange) {
      this.getTicket(changes['id'].currentValue);
    }
    if (changes['selectedPropertyIdFromShell'] && !changes['selectedPropertyIdFromShell'].firstChange) {
      this.applyShellPropertySelection(changes['selectedPropertyIdFromShell'].currentValue ?? null);
    }
    if (changes['selectedOfficeIdFromShell'] && !changes['selectedOfficeIdFromShell'].firstChange) {
      this.refreshReservationAgentOptions();
    }
    if (changes['selectedReservationIdFromShell'] && !changes['selectedReservationIdFromShell'].firstChange) {
      this.syncReservationAgentFromSelectedReservation();
    }
  }

  getTicket(id: string | number | null): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ticket');
    this.isServiceError = false;
    this.isAddMode = id === 'new' || id === null || id === undefined;

    if (this.isAddMode) {
      this.ticket = null;
      this.currentAssignee = null;
      this.currentTicketStateTypeId = TicketStateType.caseCreated;
      this.ticketCodeDisplay = '';
      this.resetForm();
      this.applyPropertySelection(this.selectedPropertyIdFromShell ?? null, true);
      this.emitPropertySelection();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ticket');
      return;
    }

    const ticketId = String(id || '').trim();
    if (!ticketId) {
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ticket');
      return;
    }

    this.ticketService.getTicketById(ticketId).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ticket'))).subscribe({
      next: (response) => {
        this.ticket = response;
        this.populateForm(response);
      },
      error: () => {
        const stateTicket = history.state?.['ticket'] as TicketResponse | undefined;
        if (stateTicket && String(stateTicket.ticketId) === ticketId) {
          this.ticket = stateTicket;
          this.populateForm(stateTicket);
          return;
        }

        this.isServiceError = true;
      }
    });
  }

  saveTicket(): void {
    if (this.isSubmitting) {
      return;
    }
    this.markFormInvalidFieldsAsTouchedAndDirty();
    const selectedPropertyIdControlValue = this.form.get('propertyId')?.value;
    const selectedPropertyId = selectedPropertyIdControlValue == null || String(selectedPropertyIdControlValue).trim() === '' ? null : String(selectedPropertyIdControlValue).trim();
    const selectedOfficeIdFromShell = this.selectedOfficeIdFromShell ?? null;
    const hasRequiredOfficeContext = !!selectedPropertyId || selectedOfficeIdFromShell != null;
    if (!hasRequiredOfficeContext) {
      this.officeSelectionInvalidOnSave.emit();
      return;
    }
    this.form.updateValueAndValidity({ emitEvent: false });
    if (!this.form.valid) {
      return;
    }

    const formValue = this.form.getRawValue();
    const existing = this.ticket;
    const user = this.authService.getUser();
    const selectedProperty = selectedPropertyId ? this.properties.find(property => property.propertyId === selectedPropertyId) || null : null;
    const selectedReservationId = this.normalizeId(this.selectedReservationIdFromShell) ?? this.normalizeId(existing?.reservationId);
    const selectedOfficeId = selectedProperty?.officeId ?? this.selectedPropertyOfficeId ?? this.selectedOfficeIdFromShell ?? existing?.officeId ?? 0;
    const selectedAssigneeId = formValue.assigneeId ? String(formValue.assigneeId).trim() : null;
    const selectedAgentId = formValue.reservationAgentId ? String(formValue.reservationAgentId).trim() : null;
    const previousAssigneeId = this.currentAssignee;
    const assigneeChanged = selectedAssigneeId !== previousAssigneeId;
    const areAllCommunicationCheckboxesChecked = !!formValue.needPermissionToEnter
      && !!formValue.permissionGranted
      && !!formValue.ownerContacted
      && !!formValue.confirmedWithTenant
      && !!formValue.followedUpWithOwner
      && !!formValue.workOrderCompleted;
    const ticketStateDecision = this.confirmTicketState({
      currentStateTypeId: Number(formValue.ticketStateTypeId ?? 0),
      previousStateTypeId: this.currentTicketStateTypeId,
      assigneeChanged: !this.isAddMode && assigneeChanged,
      currentAssigneeId: selectedAssigneeId,
      hasReservation: !!selectedReservationId,
      areAllCommunicationCheckboxesChecked
    });
    if (!ticketStateDecision.isAllowed) {
      this.openCannotCloseDialog();
      return;
    }
    const ticketStateTypeId = ticketStateDecision.ticketStateTypeId;
    const assigneeIdForSave = ticketStateTypeId === TicketStateType.caseCreated ? null : selectedAssigneeId;
    const newNoteText = String(formValue.newNote || '').trim();
    const existingNotes: TicketNoteRequest[] = (existing?.notes || []).map(note => ({
      ticketNoteId: note.ticketNoteId,
      ticketId: note.ticketId,
      note: note.note
    }));
    const canAppendNewNote = !this.isAddMode && !!existing?.ticketId && newNoteText.length > 0;
    const appendedNotes = canAppendNewNote
      ? [...existingNotes, {
          ticketId: existing!.ticketId,
          note: newNoteText
        }]
      : existingNotes;

    const request: TicketRequest = {
      ticketId: existing?.ticketId ?? null,
      organizationId: user?.organizationId || existing?.organizationId || '',
      officeId: selectedOfficeId,
      propertyId: selectedPropertyId,
      assigneeId: assigneeIdForSave,
      agentId: selectedAgentId,
      reservationId: selectedReservationId,
      ticketCode: existing?.ticketCode ?? null,
      title: String(formValue.title || '').trim(),
      description: String(formValue.description || '').trim(),
      ticketStateTypeId,
      needPermissionToEnter: !!formValue.needPermissionToEnter,
      permissionGranted: !!formValue.permissionGranted,
      ownerContacted: !!formValue.ownerContacted,
      confirmedWithTenant: !!formValue.confirmedWithTenant,
      followedUpWithOwner: !!formValue.followedUpWithOwner,
      workOrderCompleted: !!formValue.workOrderCompleted,
      notes: appendedNotes.length > 0 ? appendedNotes : null,
      isActive: !!formValue.isActive
    };

    this.isSubmitting = true;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ticketSave');
    const shouldCreateTicket = this.isAddMode || !this.ticket?.ticketId || String(this.ticket.ticketId).trim() === '';
    (shouldCreateTicket ? this.ticketService.createTicket(request) : this.ticketService.updateTicket(request)).pipe(takeUntil(this.destroy$), finalize(() => { this.isSubmitting = false; this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ticketSave'); })).subscribe({
      next: (response) => {
        this.ticket = response;
        this.currentAssignee = this.normalizeId(response.assigneeId ?? null);
        this.currentTicketStateTypeId = Number(response.ticketStateTypeId ?? TicketStateType.caseCreated);
        this.ticketCodeDisplay = response.ticketCode || '';
        this.toastr.success(
          this.isAddMode ? 'Ticket created successfully' : 'Ticket updated successfully',
          CommonMessage.Success,
          { timeOut: CommonTimeouts.Success }
        );
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: () => {
        this.toastr.error('Unable to save ticket.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      propertyId: new FormControl<string | null>(null),
      assigneeId: new FormControl<string | null>(null),
      reservationAgentId: new FormControl<string | null>({ value: null, disabled: true }),
      title: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      newNote: new FormControl(''),
      ticketStateTypeId: new FormControl(0, [Validators.required]),
      needPermissionToEnter: new FormControl(false),
      permissionGranted: new FormControl(false),
      ownerContacted: new FormControl(false),
      confirmedWithTenant: new FormControl(false),
      followedUpWithOwner: new FormControl(false),
      workOrderCompleted: new FormControl(false),
      isActive: new FormControl(true)
    });
  }

  populateForm(ticket: TicketResponse): void {
    this.ticketCodeDisplay = ticket.ticketCode || '';
    const ticketAssigneeId = (ticket as unknown as { assigneeId?: string | null }).assigneeId ?? null;
    this.currentAssignee = this.normalizeId(ticketAssigneeId);
    this.currentTicketStateTypeId = Number(ticket.ticketStateTypeId ?? TicketStateType.caseCreated);
    this.form.patchValue({
      propertyId: ticket.propertyId ?? null,
      assigneeId: ticketAssigneeId,
      reservationAgentId: ticket.agentId ?? null,
      title: ticket.title || '',
      description: ticket.description || '',
      newNote: '',
      ticketStateTypeId: ticket.ticketStateTypeId,
      needPermissionToEnter: !!ticket.needPermissionToEnter,
      permissionGranted: !!ticket.permissionGranted,
      ownerContacted: ticket.ownerContacted,
      confirmedWithTenant: ticket.confirmedWithTenant,
      followedUpWithOwner: ticket.followedUpWithOwner,
      workOrderCompleted: ticket.workOrderCompleted,
      isActive: ticket.isActive
    }, { emitEvent: false });
    this.applyPropertySelection(ticket.propertyId ?? null);
    this.emitPropertySelection();
  }

  resetForm(): void {
    this.currentAssignee = null;
    this.currentTicketStateTypeId = this.ticketStateTypes[0]?.value ?? TicketStateType.caseCreated;
    this.form.reset({
      propertyId: this.selectedPropertyIdFromShell ?? null,
      assigneeId: null,
      reservationAgentId: null,
      title: '',
      description: '',
      newNote: '',
      ticketStateTypeId: this.ticketStateTypes[0]?.value ?? 0,
      needPermissionToEnter: false,
      permissionGranted: false,
      ownerContacted: false,
      confirmedWithTenant: false,
      followedUpWithOwner: false,
      workOrderCompleted: false,
      isActive: true
    }, { emitEvent: false });
  }
  //#endregion

  //#region Form Response Methods
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

  get ticketNotesDisplay(): { author: string; createdOn: string; note: string }[] {
    return (this.ticket?.notes || [])
      .filter(note => !!String(note.note || '').trim())
      .sort((a, b) => {
        const aTime = Date.parse(String(a.createdOn || '')) || 0;
        const bTime = Date.parse(String(b.createdOn || '')) || 0;
        return bTime - aTime;
      })
      .map(note => ({
        author: String(note.createdByName || note.modifiedByName || note.createdBy || note.modifiedBy || '').trim() || 'Unknown',
        createdOn: this.formatterService.formatDateTimeString(note.createdOn) || '',
        note: String(note.note || '').trim()
      }));
  }

  onPropertyDropdownChange(value: string | null): void {
    this.applyPropertySelection(value);
    this.emitPropertySelection();
  }

  onAssigneeChanged(): void {
    const assigneeControlValue = this.form.get('assigneeId')?.value;
    const currentAssigneeId = this.normalizeId(assigneeControlValue == null ? null : String(assigneeControlValue));
    const formValue = this.form.getRawValue();
    const reservationId = this.normalizeId(this.selectedReservationIdFromShell) ?? this.normalizeId(this.ticket?.reservationId);
    const stateDecision = this.confirmTicketState({
      currentStateTypeId: Number(this.form.get('ticketStateTypeId')?.value ?? TicketStateType.caseCreated),
      previousStateTypeId: this.currentTicketStateTypeId,
      assigneeChanged: currentAssigneeId !== this.currentAssignee,
      currentAssigneeId,
      hasReservation: !!reservationId,
      areAllCommunicationCheckboxesChecked: !!formValue.needPermissionToEnter
        && !!formValue.permissionGranted
        && !!formValue.ownerContacted
        && !!formValue.confirmedWithTenant
        && !!formValue.followedUpWithOwner
        && !!formValue.workOrderCompleted
    });
    if (!stateDecision.isAllowed) {
      this.form.get('ticketStateTypeId')?.setValue(stateDecision.ticketStateTypeId, { emitEvent: false });
      this.currentTicketStateTypeId = stateDecision.ticketStateTypeId;
      this.openCannotCloseDialog();
      return;
    }
    if (Number(this.form.get('ticketStateTypeId')?.value ?? 0) !== stateDecision.ticketStateTypeId) {
      this.form.get('ticketStateTypeId')?.setValue(stateDecision.ticketStateTypeId, { emitEvent: false });
    }
    this.currentTicketStateTypeId = stateDecision.ticketStateTypeId;
  }

  onTicketStatusChanged(): void {
    const formValue = this.form.getRawValue();
    const reservationId = this.normalizeId(this.selectedReservationIdFromShell) ?? this.normalizeId(this.ticket?.reservationId);
    const stateDecision = this.confirmTicketState({
      currentStateTypeId: Number(this.form.get('ticketStateTypeId')?.value ?? TicketStateType.caseCreated),
      previousStateTypeId: this.currentTicketStateTypeId,
      assigneeChanged: false,
      currentAssigneeId: this.normalizeId(this.form.get('assigneeId')?.value == null ? null : String(this.form.get('assigneeId')?.value)),
      hasReservation: !!reservationId,
      areAllCommunicationCheckboxesChecked: !!formValue.needPermissionToEnter
        && !!formValue.permissionGranted
        && !!formValue.ownerContacted
        && !!formValue.confirmedWithTenant
        && !!formValue.followedUpWithOwner
        && !!formValue.workOrderCompleted
    });
    if (!stateDecision.isAllowed) {
      this.form.get('ticketStateTypeId')?.setValue(stateDecision.ticketStateTypeId, { emitEvent: false });
      this.currentTicketStateTypeId = stateDecision.ticketStateTypeId;
      this.openCannotCloseDialog();
      return;
    }
    if (stateDecision.ticketStateTypeId === TicketStateType.caseCreated && this.form.get('assigneeId')?.value != null) {
      this.form.get('assigneeId')?.setValue(null, { emitEvent: false });
    }
    if (Number(this.form.get('ticketStateTypeId')?.value ?? 0) !== stateDecision.ticketStateTypeId) {
      this.form.get('ticketStateTypeId')?.setValue(stateDecision.ticketStateTypeId, { emitEvent: false });
    }
    this.currentTicketStateTypeId = stateDecision.ticketStateTypeId;
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
    const scopedOfficeId = officeId === 0 ? null : officeId;
    this.assigneeOptions = (this.users || [])
      .filter(user => {
        if (!user.isActive || !hasCompanyRole(user.userGroups)) {
          return false;
        }
        if (scopedOfficeId == null) {
          return true;
        }
        const normalizedOfficeAccess = (user.officeAccess || []).map(accessId => Number(accessId)).filter(accessId => !isNaN(accessId));
        return normalizedOfficeAccess.includes(scopedOfficeId);
      })
      .map(user => ({
        userId: user.userId,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    const currentAssigneeId = this.form.get('assigneeId')?.value == null ? null : String(this.form.get('assigneeId')?.value);
    const ticketAssigneeId = this.normalizeId(this.ticket?.assigneeId ?? null);
    const preferredAssigneeId = currentAssigneeId || ticketAssigneeId;
    const isPreferredAssigneeValid = !!preferredAssigneeId && this.assigneeOptions.some(option => option.userId === preferredAssigneeId);
    if (!keepAssigneeIfValid || !isPreferredAssigneeValid || currentAssigneeId !== preferredAssigneeId) {
      this.form.get('assigneeId')?.setValue(isPreferredAssigneeValid ? preferredAssigneeId : null, { emitEvent: false });
    }

    this.refreshReservationAgentOptions();
    this.syncReservationAgentFromSelectedReservation();
  }

  normalizeId(value: string | null | undefined): string | null {
    const normalized = String(value || '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  refreshReservationAgentOptions(): void {
    const globalOfficeId = this.selectedOfficeIdFromShell === 0 ? null : this.selectedOfficeIdFromShell;
    this.reservationAgentOptions = (this.agents || [])
      .filter(agent => agent.isActive && (globalOfficeId == null || agent.officeId === globalOfficeId))
      .map(agent => ({
        agentId: agent.agentId,
        displayName: String(agent.name || '').trim() || String(agent.agentCode || '').trim()
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    const currentReservationAgentId = this.form.get('reservationAgentId')?.value == null ? null : String(this.form.get('reservationAgentId')?.value);
    const isCurrentReservationAgentValid = !!currentReservationAgentId && this.reservationAgentOptions.some(option => option.agentId === currentReservationAgentId);
    if (!isCurrentReservationAgentValid) {
      this.form.get('reservationAgentId')?.setValue(null, { emitEvent: false });
    }
  }

  syncReservationAgentFromSelectedReservation(): void {
    const reservationId = this.normalizeId(this.ticket?.reservationId ?? this.selectedReservationIdFromShell);
    const reservationAgentControl = this.form.get('reservationAgentId');

    if (!reservationId) {
      reservationAgentControl?.setValue(null, { emitEvent: false });
      this.reservationAgentSyncKey = null;
      return;
    }

    const officeId = this.selectedPropertyOfficeId ?? this.selectedOfficeIdFromShell ?? this.ticket?.officeId ?? null;
    const syncKey = `${reservationId}:${officeId ?? 'none'}`;
    if (this.reservationAgentSyncKey === syncKey) {
      return;
    }
    this.reservationAgentSyncKey = syncKey;

    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservationAgent');
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservationAgent'))).subscribe({
      next: (reservation: ReservationResponse) => {
        const reservationAgentId = this.normalizeId(reservation.agentId);
        const matchingAgent = reservationAgentId
          ? this.reservationAgentOptions.find(option => option.agentId === reservationAgentId) || null
          : null;
        reservationAgentControl?.setValue(matchingAgent?.agentId ?? null, { emitEvent: false });
      },
      error: () => {}
    });
  }

  emitPropertySelection(): void {
    const propertyIdControlValue = this.form.get('propertyId')?.value;
    const propertyId = propertyIdControlValue == null || String(propertyIdControlValue).trim() === '' ? null : String(propertyIdControlValue);
    const reservationId = this.normalizeId(this.selectedReservationIdFromShell ?? this.ticket?.reservationId ?? null);
    const officeId = this.selectedPropertyOfficeId ?? this.ticket?.officeId ?? this.selectedOfficeIdFromShell ?? null;
    this.propertySelectionChange.emit({
      propertyId,
      officeId,
      reservationId
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
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
    this.userService.getUsers().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users'))).subscribe({
      next: users => {
        this.users = users || [];
        const selectedPropertyId = this.form?.get('propertyId')?.value == null ? this.selectedPropertyIdFromShell : String(this.form.get('propertyId')?.value);
        this.applyPropertySelection(selectedPropertyId, true);
        const ticketAssigneeId = this.normalizeId(this.ticket?.assigneeId ?? null);
        const hasTicketAssignee = !!ticketAssigneeId && this.assigneeOptions.some(option => option.userId === ticketAssigneeId);
        if (hasTicketAssignee) {
          this.form.get('assigneeId')?.setValue(ticketAssigneeId, { emitEvent: false });
        }
      },
      error: () => {
        this.users = [];
      }
    });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'))).subscribe({
      next: agents => {
        this.agents = agents || [];
        this.reservationAgentSyncKey = null;
        this.refreshReservationAgentOptions();
        this.syncReservationAgentFromSelectedReservation();
      },
      error: () => {
        this.agents = [];
        this.refreshReservationAgentOptions();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  back(): void {
    this.backEvent.emit();
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.ticket?.officeId ?? null,
      propertyId: this.ticket?.propertyId ?? null,
      reservationId: this.ticket?.reservationId ?? null,
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

  openCannotCloseDialog(): void {
    const dialogData: GenericModalData = {
      title: 'Unable to Close Ticket',
      message: 'This ticket cannot be closed until all tenant/owner communication(s) have occurred and work orders completed.',
      icon: 'warning' as any,
      iconColor: 'accent',
      no: '',
      yes: 'OK',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: false
    };
    this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });
  }

  confirmTicketState(params: {
    currentStateTypeId: number;
    previousStateTypeId?: number;
    assigneeChanged: boolean;
    currentAssigneeId: string | null;
    hasReservation: boolean;
    areAllCommunicationCheckboxesChecked: boolean;
  }): { ticketStateTypeId: number; isAllowed: boolean } {
    let resolvedStateTypeId = Number(params.currentStateTypeId ?? 0);

    if (params.assigneeChanged) {
      if (!params.currentAssigneeId) {
        resolvedStateTypeId = TicketStateType.caseCreated;
      } else {
        resolvedStateTypeId = TicketStateType.assigned;
      }
    }

    const isAttemptingClose = resolvedStateTypeId === TicketStateType.closed;
    if (isAttemptingClose && params.hasReservation && !params.areAllCommunicationCheckboxesChecked) {
      return {
        ticketStateTypeId: Number(params.previousStateTypeId ?? TicketStateType.caseCreated),
        isAllowed: false
      };
    }

    return {
      ticketStateTypeId: resolvedStateTypeId,
      isAllowed: true
    };
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

  markFormInvalidFieldsAsTouchedAndDirty(): void {
    this.form.markAllAsTouched();
    Object.keys(this.form.controls).forEach(controlName => {
      const control = this.form.get(controlName);
      control?.markAsDirty();
      control?.updateValueAndValidity({ emitEvent: false });
    });
  }
  //#endregion
}
