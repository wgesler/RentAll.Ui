import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { isReceiptCompanyPropertyId } from '../../maintenance/models/receipt.model';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { TicketStateType } from '../../tickets/models/ticket-enum';
import { TicketRequest, TicketResponse } from '../../tickets/models/ticket-models';
import { TicketService } from '../../tickets/services/ticket.service';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { isMobileRentAllTicketTab } from '../mobile-nav';
import { MobileTicketReturnState } from '../mobile-ticket-return.util';
import { MobileListField, MobileListFieldOption, MobileTicketNoteDisplay } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-ticket-detail',
  imports: [MaterialModule, FormsModule],
  templateUrl: './mobile-ticket-detail.component.html',
  styleUrl: './mobile-ticket-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileTicketDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ticketId = '';
  @Input() tabPath = 'my-tickets';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() ticketCodeChange = new EventEmitter<string>();
  @ViewChild('descriptionTextarea') descriptionTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('stepsToReproduceTextarea') stepsToReproduceTextarea?: ElementRef<HTMLTextAreaElement>;
  private ticketService = inject(TicketService);
  private mappingService = inject(MappingService);
  private userService = inject(UserService);
  private agentService = inject(AgentService);
  private officeService = inject(OfficeService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  ticket: TicketResponse | null = null;
  fields: MobileListField[] = [];
  notes: MobileTicketNoteDisplay[] = [];
  users: UserResponse[] = [];
  agents: AgentResponse[] = [];
  offices: OfficeResponse[] = [];
  allProperties: PropertyCodeResponse[] = [];
  allReservations: ReservationCodeResponse[] = [];
  contacts: ContactResponse[] = [];
  organizationId = '';
  assigneeOptions: MobileListFieldOption[] = [];
  agentOptions: MobileListFieldOption[] = [];
  stepsToReproduce = '';
  newNote = '';
  isPageReady = false;
  isSaving = false;
  isDirty = false;
  isAdmin = false;
  destroy$ = new Subject<void>();
  readonly communicationFieldKeys = [
    'needPermissionToEnter',
    'permissionGranted',
    'ownerContacted',
    'confirmedWithTenant',
    'followedUpWithOwner',
    'workOrderCompleted'
  ] as const;
  readonly statusFieldKeys = ['ticketCode', 'officeId', 'propertyId', 'reservationId', 'modifiedOn', 'ticketStateTypeId', 'assigneeId', 'agentId'] as const;

  //#region Mobile-Ticket-Detail
  get isAddMode(): boolean {
    return this.ticketId.trim() === 'new';
  }

  get defaultIsForRentAll(): boolean {
    return this.authService.isAdmin() && isMobileRentAllTicketTab(this.tabPath);
  }

  get canUseForRentAll(): boolean {
    return this.defaultIsForRentAll;
  }

  get isForRentAllMode(): boolean {
    const field = this.fields.find(item => item.key === 'isForRentAll');
    return field?.value === 'true';
  }

  get showForRentAllCheckbox(): boolean {
    return this.canUseForRentAll;
  }

  get showAssigneeAndAgentFields(): boolean {
    return !this.isForRentAllMode;
  }

  get showCommunicationStatusSection(): boolean {
    return !this.isForRentAllMode;
  }

  get showStepsToReproduceField(): boolean {
    return this.canUseForRentAll && this.isForRentAllMode;
  }

  get showReceiptWorkOrderActions(): boolean {
    return !this.isAddMode && !this.isForRentAllMode;
  }

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadUsers();
    this.loadAgents();
    this.loadOffices();
    this.loadPropertyCodes();
    this.loadReservationCodes();
    this.loadContacts();
    this.syncAddModeDefaults();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ticketId']) {
      this.getTicket();
    }
    if (changes['tabPath'] && this.ticket && !this.isDirty) {
      if (this.isAddMode) {
        this.ticket = this.buildAddModeTicketSkeleton();
        this.ticketCodeChange.emit('New');
      }
      this.applyFields();
    }
  }

  getTicket(): void {
    this.loadTicket();
  }

  updateTicket(): void {
    const ticketId = this.ticketId.trim();
    if (!ticketId || this.isSaving || !this.ticket) {
      return;
    }
    const title = this.fields.find(field => field.key === 'title')?.value?.trim() || '';
    if (!title) {
      this.toastr.error('Please enter a title before saving.', CommonMessage.Error);
      return;
    }
    this.isSaving = true;
    this.markViewForCheck();
    this.ticketService.getTicketById(ticketId).pipe(
      take(1),
      takeUntil(this.destroy$),
      switchMap(ticket => {
        const overrides = this.buildSaveOverrides(ticket);
        const request: TicketRequest = this.mappingService.mapTicketUpdateRequest(ticket, overrides);
        return this.ticketService.updateTicket(request);
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: saved => {
        this.ticket = saved;
        this.ticketCodeChange.emit(saved.ticketCode || '');
        this.stepsToReproduce = saved.stepsToReproduce || '';
        this.fields = this.mapFields(saved);
        this.notes = this.mappingService.mapMobileTicketNoteDisplays(saved.notes);
        this.newNote = '';
        this.setDirty(false);
        this.toastr.success('Ticket updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Ticket could not be saved.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  saveTicket(): void {
    if (this.isAddMode) {
      this.createTicket();
      return;
    }
    this.updateTicket();
  }

  createTicket(): void {
    if (this.isSaving || !this.ticket) {
      return;
    }
    const title = this.fields.find(field => field.key === 'title')?.value?.trim() || '';
    if (!title) {
      this.toastr.error('Please enter a title before saving.', CommonMessage.Error);
      return;
    }
    if (this.showStepsToReproduceField && !this.stepsToReproduce.trim()) {
      this.toastr.error('Please enter steps to reproduce before saving.', CommonMessage.Error);
      return;
    }
    const propertyId = this.getSelectedPropertyId();
    const officeId = this.getResolvedOfficeId();
    if (!propertyId && !officeId) {
      this.toastr.error('Please select an office or property before saving.', CommonMessage.Error);
      return;
    }
    const property = propertyId
      ? this.allProperties.find(item => this.utilityService.normalizeId(item.propertyId) === this.utilityService.normalizeId(propertyId))
      : null;
    const resolvedOfficeId = property?.officeId ?? officeId ?? 0;
    if (!resolvedOfficeId) {
      this.toastr.error('Please select an office or property before saving.', CommonMessage.Error);
      return;
    }
    const isForRentAll = this.canUseForRentAll ? this.isForRentAllMode : false;
    const overrides = this.buildSaveOverrides(this.ticket);
    const newNote = this.newNote.trim();
    const request: TicketRequest = {
      ticketId: null,
      organizationId: this.organizationId,
      officeId: resolvedOfficeId,
      propertyId: overrides.propertyId ?? null,
      reservationId: overrides.reservationId ?? null,
      assigneeId: isForRentAll ? null : (overrides.assigneeId ?? null),
      agentId: isForRentAll ? null : (overrides.agentId ?? null),
      ticketCode: null,
      title: overrides.title || title,
      description: overrides.description || '',
      stepsToReproduce: isForRentAll ? (this.stepsToReproduce.trim() || null) : null,
      ticketStateTypeId: TicketStateType.caseCreated,
      needPermissionToEnter: isForRentAll ? false : !!overrides.needPermissionToEnter,
      permissionGranted: isForRentAll ? false : !!overrides.permissionGranted,
      ownerContacted: isForRentAll ? false : !!overrides.ownerContacted,
      confirmedWithTenant: isForRentAll ? false : !!overrides.confirmedWithTenant,
      followedUpWithOwner: isForRentAll ? false : !!overrides.followedUpWithOwner,
      workOrderCompleted: isForRentAll ? false : !!overrides.workOrderCompleted,
      isForRentAll,
      notes: newNote ? [{ note: newNote }] : null,
      isActive: overrides.isActive ?? true
    };
    this.isSaving = true;
    this.markViewForCheck();
    this.ticketService.createTicket(request).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Ticket created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        void this.router.navigate(['/mobile', 'tickets', this.tabPath || 'my-tickets']);
      },
      error: () => {
        this.toastr.error('Ticket could not be saved.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  onFieldChange(): void {
    this.setDirty(true);
  }

  onSelectChange(field: MobileListField, value: string | string[]): void {
    if (field.multiple) {
      field.value = (Array.isArray(value) ? value : []).join(', ');
      this.onFieldChange();
      return;
    }
    field.value = String(value ?? '');
    if (field.key === 'officeId') {
      this.applyOfficeScopeChange();
    } else if (field.key === 'propertyId') {
      this.applyPropertyScopeChange();
    }
    this.onFieldChange();
  }

  getSelectedValues(field: MobileListField): string[] {
    return field.value ? field.value.split(',').map(value => value.trim()).filter(value => !!value) : [];
  }

  getField(key: string): MobileListField | null {
    return this.fields.find(field => field.key === key) ?? null;
  }

  getPanelFields(keys: readonly string[]): MobileListField[] {
    const keyOrder = new Map(keys.map((key, index) => [key, index]));
    return this.fields.filter(field => keyOrder.has(field.key)).sort((left, right) => (keyOrder.get(left.key) ?? 0) - (keyOrder.get(right.key) ?? 0));
  }

  getStatusFields(): MobileListField[] {
    return this.getPanelFields(this.statusFieldKeys).filter(field => this.showAssigneeAndAgentFields || (field.key !== 'assigneeId' && field.key !== 'agentId'));
  }

  getTitleField(): MobileListField | null {
    return this.getField('title');
  }

  getDescriptionField(): MobileListField | null {
    return this.getField('description');
  }

  getIsActiveField(): MobileListField | null {
    return this.getField('isActive');
  }

  getIsForRentAllField(): MobileListField | null {
    return this.getField('isForRentAll');
  }

  getCommunicationCheckboxFields(): MobileListField[] {
    return this.fields.filter(field => this.communicationFieldKeys.includes(field.key as typeof this.communicationFieldKeys[number]));
  }

  isBooleanFieldChecked(field: MobileListField): boolean {
    return field.value === 'true';
  }

  onBooleanFieldChange(field: MobileListField, checked: boolean): void {
    field.value = checked ? 'true' : 'false';
    if (field.key === 'isForRentAll') {
      this.onIsForRentAllChanged(checked);
    }
    this.onFieldChange();
  }

  onIsForRentAllChanged(isForRentAll: boolean): void {
    if (isForRentAll) {
      const assigneeField = this.getField('assigneeId');
      const agentField = this.getField('agentId');
      if (assigneeField) {
        assigneeField.value = '';
      }
      if (agentField) {
        agentField.value = '';
      }
      this.getCommunicationCheckboxFields().forEach(field => {
        field.value = 'false';
      });
    } else {
      this.stepsToReproduce = '';
    }
    this.queueMultilineTextareaHeightSync();
    this.markViewForCheck();
  }

  onDescriptionInput(event: Event): void {
    this.onFieldChange();
    this.syncTextareaHeight(event.target as HTMLTextAreaElement);
  }

  onStepsToReproduceInput(event: Event): void {
    this.onFieldChange();
    this.syncTextareaHeight(event.target as HTMLTextAreaElement);
  }

  onMultilineResize(event: Event, textarea?: HTMLTextAreaElement | null): void {
    this.syncTextareaHeight(textarea ?? (event.target as HTMLTextAreaElement));
  }

  syncTextareaHeight(textarea?: HTMLTextAreaElement | null): void {
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    const minHeight = Number.parseFloat(getComputedStyle(textarea).minHeight) || 0;
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  }

  queueMultilineTextareaHeightSync(): void {
    queueMicrotask(() => {
      this.syncTextareaHeight(this.descriptionTextarea?.nativeElement);
      this.syncTextareaHeight(this.stepsToReproduceTextarea?.nativeElement);
    });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  openAddReceipt(): void {
    const propertyId = this.getSelectedPropertyId();
    if (!propertyId) {
      this.toastr.warning('Select a property before adding a receipt.', 'Missing property');
      return;
    }

    const ticketId = String(this.ticket?.ticketId || '').trim();
    if (!ticketId) {
      return;
    }

    void this.router.navigate(['/mobile', 'maintenance', 'receipts', 'new'], {
      queryParams: {
        propertyId,
        ticketId,
        returnTicketId: ticketId,
        returnTicketTab: this.tabPath
      }
    });
  }

  openAddWorkOrder(): void {
    const propertyId = this.getSelectedPropertyId();
    if (!propertyId) {
      this.toastr.warning('Select a property before adding a work order.', 'Missing property');
      return;
    }

    const ticketId = String(this.ticket?.ticketId || '').trim();
    if (!ticketId) {
      return;
    }

    const returnState: MobileTicketReturnState = {
      initialTitle: this.getTicketTitleForWorkOrder(),
      initialDescription: this.getTicketDescriptionForWorkOrder(),
      initialReservationId: this.getTicketReservationIdForWorkOrder()
    };

    void this.router.navigate(['/mobile', 'maintenance', 'work-orders', 'new'], {
      queryParams: {
        propertyId,
        maintenanceId: ticketId,
        returnTicketId: ticketId,
        returnTicketTab: this.tabPath
      },
      state: returnState
    });
  }

  getTicketTitleForWorkOrder(): string {
    return String(this.getTitleField()?.value ?? this.ticket?.title ?? '').trim();
  }

  getTicketDescriptionForWorkOrder(): string {
    const rawDescription = String(this.getDescriptionField()?.value ?? this.ticket?.description ?? '').trim();
    return this.htmlToPlainText(rawDescription).slice(0, 2048);
  }

  getTicketReservationIdForWorkOrder(): string | null {
    return this.utilityService.normalizeIdOrNull(this.getField('reservationId')?.value ?? this.ticket?.reservationId ?? null);
  }

  htmlToPlainText(html: string): string {
    const value = String(html || '').trim();
    if (!value) {
      return '';
    }
    if (!/<[a-z][\s\S]*>/i.test(value)) {
      return value;
    }

    const doc = new DOMParser().parseFromString(value, 'text/html');
    return (doc.body.textContent || doc.body.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .trim();
  }
  //#endregion

  //#region Data Loading Methods
  loadTicket(): void {
    const ticketId = this.ticketId.trim();
    this.isPageReady = false;
    this.ticket = null;
    this.fields = [];
    this.notes = [];
    this.stepsToReproduce = '';
    this.newNote = '';
    this.setDirty(false);
    this.markViewForCheck();
    if (!ticketId) {
      this.isPageReady = true;
      this.markViewForCheck();
      return;
    }
    if (this.isAddMode) {
      this.ticket = this.buildAddModeTicketSkeleton();
      this.ticketCodeChange.emit('New');
      this.isPageReady = true;
      this.applyFields();
      this.queueMultilineTextareaHeightSync();
      this.markViewForCheck();
      return;
    }
    this.ticketService.getTicketById(ticketId).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isPageReady = true;
        this.queueMultilineTextareaHeightSync();
        this.markViewForCheck();
      })
    ).subscribe({
      next: ticket => {
        this.ticket = ticket;
        this.ticketCodeChange.emit(ticket.ticketCode || '');
        this.stepsToReproduce = ticket.stepsToReproduce || '';
        this.notes = this.mappingService.mapMobileTicketNoteDisplays(ticket.notes);
        this.applyFields();
      },
      error: () => {
        this.ticket = null;
        this.fields = [];
        this.notes = [];
        this.markViewForCheck();
      }
    });
  }

  loadUsers(): void {
    this.userService.getUsers().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: users => {
        this.users = users || [];
        this.applyFields();
      },
      error: () => {
        this.users = [];
        this.applyFields();
      }
    });
  }

  loadAgents(): void {
    this.agentService.ensureAgentsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.agentService.getAllAgents().pipe(takeUntil(this.destroy$)).subscribe(agents => {
          this.agents = agents || [];
          this.applyFields();
        });
      },
      error: () => {
        this.agents = [];
        this.applyFields();
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      this.applyFields();
      return;
    }
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive !== false);
          this.applyFields();
        });
      },
      error: () => {
        this.offices = [];
        this.applyFields();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.allProperties = properties || [];
            this.applyFields();
          },
          error: () => {
            this.allProperties = [];
            this.applyFields();
          }
        });
      },
      error: () => {
        this.allProperties = [];
        this.applyFields();
      }
    });
  }

  loadReservationCodes(): void {
    this.reservationService.ensureReservationCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.reservationService.getAllReservationCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: reservations => {
            this.allReservations = reservations || [];
            this.applyFields();
          },
          error: () => {
            this.allReservations = [];
            this.applyFields();
          }
        });
      },
      error: () => {
        this.allReservations = [];
        this.applyFields();
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: contacts => {
        this.contacts = contacts || [];
        this.applyFields();
      },
      error: () => {
        this.contacts = [];
        this.applyFields();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  syncAddModeDefaults(): void {
    if (!this.isAddMode || this.isDirty || !this.ticket) {
      return;
    }
    const shouldBeForRentAll = this.defaultIsForRentAll;
    if (this.ticket.isForRentAll === shouldBeForRentAll) {
      return;
    }
    this.ticket = this.buildAddModeTicketSkeleton();
    this.applyFields();
    this.markViewForCheck();
  }

  buildAddModeTicketSkeleton(): TicketResponse {
    const officeId = this.resolveInitialAddOfficeId();
    const office = this.offices.find(item => Number(item.officeId) === Number(officeId));
    const now = new Date().toISOString();
    return {
      ticketId: '',
      organizationId: this.organizationId,
      officeId: officeId ?? 0,
      officeName: office?.name ?? '',
      propertyId: null,
      propertyCode: null,
      reservationId: null,
      reservationCode: null,
      assigneeId: null,
      agentId: null,
      ticketCode: 'New',
      title: '',
      description: '',
      stepsToReproduce: null,
      ticketStateTypeId: TicketStateType.caseCreated,
      needPermissionToEnter: false,
      permissionGranted: false,
      ownerContacted: false,
      confirmedWithTenant: false,
      followedUpWithOwner: false,
      workOrderCompleted: false,
      isForRentAll: this.defaultIsForRentAll,
      notes: [],
      isActive: true,
      createdOn: now,
      modifiedOn: now
    };
  }

  resolveInitialAddOfficeId(): number {
    const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    if (globalOfficeId != null && globalOfficeId > 0) {
      return globalOfficeId;
    }
    if (this.offices.length === 1) {
      return this.offices[0].officeId;
    }
    return 0;
  }

  buildSaveOverrides(ticket: TicketResponse): Partial<TicketRequest> {
    const isForRentAll = this.canUseForRentAll ? this.isForRentAllMode : false;
    const overrides = this.mappingService.mapMobileTicketDetailOverrides(ticket, this.fields, this.newNote);
    return {
      ...overrides,
      assigneeId: isForRentAll ? null : (overrides.assigneeId ?? ticket.assigneeId ?? null),
      agentId: isForRentAll ? null : (overrides.agentId ?? ticket.agentId ?? null),
      stepsToReproduce: isForRentAll ? (this.stepsToReproduce.trim() || null) : null,
      needPermissionToEnter: isForRentAll ? false : !!overrides.needPermissionToEnter,
      permissionGranted: isForRentAll ? false : !!overrides.permissionGranted,
      ownerContacted: isForRentAll ? false : !!overrides.ownerContacted,
      confirmedWithTenant: isForRentAll ? false : !!overrides.confirmedWithTenant,
      followedUpWithOwner: isForRentAll ? false : !!overrides.followedUpWithOwner,
      workOrderCompleted: isForRentAll ? false : !!overrides.workOrderCompleted,
      isForRentAll
    };
  }

  applyFields(): void {
    if (!this.ticket || this.isDirty) {
      return;
    }
    if (this.isAddMode && !this.ticket.officeId) {
      const officeId = this.resolveInitialAddOfficeId();
      if (officeId > 0) {
        const office = this.offices.find(item => Number(item.officeId) === Number(officeId));
        this.ticket = {
          ...this.ticket,
          officeId,
          officeName: office?.name ?? this.ticket.officeName
        };
      }
    }
    this.refreshAssigneeAgentOptions();
    this.fields = this.mapFields(this.ticket);
    this.queueMultilineTextareaHeightSync();
    this.markViewForCheck();
  }

  mapFields(ticket: TicketResponse): MobileListField[] {
    return this.mappingService.mapMobileTicketDetailFields(ticket, {
      assignees: this.assigneeOptions,
      agents: this.agentOptions,
      offices: this.buildOfficeOptions(ticket),
      properties: this.buildPropertyOptions(ticket),
      reservations: this.buildReservationOptions(ticket)
    });
  }

  refreshAssigneeAgentOptions(): void {
    const officeId = this.getResolvedOfficeId();
    this.assigneeOptions = this.mappingService.mapMobileTicketAssigneeOptions(this.users, officeId);
    this.agentOptions = this.mappingService.mapMobileTicketAgentOptions(this.agents, officeId);
  }

  refreshScopeFieldOptions(): void {
    if (!this.ticket) {
      return;
    }
    const officeField = this.getField('officeId');
    const propertyField = this.getField('propertyId');
    const reservationField = this.getField('reservationId');
    const assigneeField = this.getField('assigneeId');
    const agentField = this.getField('agentId');
    if (officeField) {
      officeField.options = this.buildOfficeOptions(this.ticket);
    }
    if (propertyField) {
      propertyField.options = this.buildPropertyOptions(this.ticket);
    }
    if (reservationField) {
      reservationField.options = this.buildReservationOptions(this.ticket);
    }
    if (assigneeField) {
      assigneeField.options = this.assigneeOptions;
    }
    if (agentField) {
      agentField.options = this.agentOptions;
    }
  }

  applyOfficeScopeChange(): void {
    this.clearOutOfScopePropertySelection();
    this.clearOutOfScopeReservationSelection();
    this.refreshAssigneeAgentOptions();
    this.refreshScopeFieldOptions();
    this.markViewForCheck();
  }

  applyPropertyScopeChange(): void {
    const propertyId = this.getSelectedPropertyId();
    if (isReceiptCompanyPropertyId(propertyId)) {
      this.clearOutOfScopeReservationSelection();
      this.refreshAssigneeAgentOptions();
      this.refreshScopeFieldOptions();
      this.markViewForCheck();
      return;
    }
    const property = propertyId
      ? this.allProperties.find(item => this.utilityService.normalizeId(item.propertyId) === this.utilityService.normalizeId(propertyId))
      : null;
    if (property?.officeId) {
      const officeField = this.getField('officeId');
      if (officeField) {
        officeField.value = String(property.officeId);
      }
    }
    this.clearOutOfScopeReservationSelection();
    this.refreshAssigneeAgentOptions();
    this.refreshScopeFieldOptions();
    this.markViewForCheck();
  }

  buildOfficeOptions(ticket: TicketResponse): MobileListFieldOption[] {
    const options = this.mappingService.mapMobileTicketOfficeOptions(this.offices);
    return this.mappingService.mergeMobileIdOption(options, String(ticket.officeId || ''), ticket.officeName);
  }

  buildPropertyOptions(ticket: TicketResponse): MobileListFieldOption[] {
    const options = this.mappingService.mapMobileTicketPropertyOptions(this.getScopedProperties());
    return this.mappingService.mergeMobileIdOption(options, ticket.propertyId, ticket.propertyCode);
  }

  buildReservationOptions(ticket: TicketResponse): MobileListFieldOption[] {
    const options = this.mappingService.mapMobileTicketReservationOptions(this.getScopedReservations(), this.contacts);
    return this.mappingService.mergeMobileIdOption(options, ticket.reservationId, ticket.reservationCode);
  }

  getResolvedOfficeId(): number | null {
    const fieldValue = this.getField('officeId')?.value;
    const parsedFieldValue = Number(fieldValue);
    if (Number.isFinite(parsedFieldValue) && parsedFieldValue > 0) {
      return parsedFieldValue;
    }
    const ticketOfficeId = Number(this.ticket?.officeId ?? 0);
    return Number.isFinite(ticketOfficeId) && ticketOfficeId > 0 ? ticketOfficeId : null;
  }

  getSelectedPropertyId(): string | null {
    return this.utilityService.normalizeIdOrNull(this.getField('propertyId')?.value ?? this.ticket?.propertyId ?? null);
  }

  getSelectedReservationId(): string | null {
    return this.utilityService.normalizeIdOrNull(this.getField('reservationId')?.value ?? this.ticket?.reservationId ?? null);
  }

  getScopedProperties(): PropertyCodeResponse[] {
    const officeId = this.getResolvedOfficeId();
    const scoped = (officeId == null
      ? this.allProperties
      : this.allProperties.filter(property => Number(property.officeId) === Number(officeId)))
      .filter(property => !isReceiptCompanyPropertyId(property.propertyId));
    return scoped.slice().sort((left, right) =>
      String(left.propertyCode || '').localeCompare(String(right.propertyCode || ''), undefined, { sensitivity: 'base' })
    );
  }

  getScopedReservations(): ReservationCodeResponse[] {
    const officeId = this.getResolvedOfficeId();
    const propertyId = this.getSelectedPropertyId();
    const scopedByOffice = officeId == null
      ? this.allReservations
      : this.allReservations.filter(reservation => Number(reservation.officeId) === Number(officeId));
    const scopedByProperty = propertyId && !isReceiptCompanyPropertyId(propertyId)
      ? scopedByOffice.filter(reservation => this.utilityService.normalizeIdOrNull(reservation.propertyId) === propertyId)
      : scopedByOffice;
    return scopedByProperty.slice().sort((left, right) =>
      String(left.reservationCode || '').localeCompare(String(right.reservationCode || ''), undefined, { sensitivity: 'base' })
    );
  }

  clearOutOfScopePropertySelection(): void {
    const propertyField = this.getField('propertyId');
    if (!propertyField?.value) {
      return;
    }
    const propertyId = this.getSelectedPropertyId();
    const isInScope = !!propertyId && (
      isReceiptCompanyPropertyId(propertyId)
      || this.getScopedProperties().some(property => this.utilityService.normalizeId(property.propertyId) === propertyId)
    );
    if (!isInScope) {
      propertyField.value = '';
    }
  }

  clearOutOfScopeReservationSelection(): void {
    const reservationField = this.getField('reservationId');
    if (!reservationField?.value) {
      return;
    }
    const reservationId = this.getSelectedReservationId();
    const isInScope = !!reservationId && this.getScopedReservations().some(reservation => this.utilityService.normalizeId(reservation.reservationId) === this.utilityService.normalizeId(reservationId));
    if (!isInScope) {
      reservationField.value = '';
    }
  }

  setDirty(isDirty: boolean): void {
    if (this.isDirty === isDirty) {
      return;
    }
    this.isDirty = isDirty;
    this.dirtyChange.emit(isDirty);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
