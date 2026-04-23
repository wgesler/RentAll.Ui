import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, map } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { getTicketStateTypes } from '../models/ticket-enum';
import { TicketResponse } from '../models/ticket-models';

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
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  ticket: TicketResponse | null = null;
  form: FormGroup;
  ticketStateTypes = getTicketStateTypes();

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ticket']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService
  ) {}

  //#region Ticket
  ngOnInit(): void {
    this.buildForm();
    this.initializeTicketById(this.id);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].firstChange) {
      this.initializeTicketById(changes['id'].currentValue);
    }
  }

  initializeTicketById(id: string | number | null): void {
    this.isAddMode = id === 'new' || id === null || id === undefined;

    if (this.isAddMode) {
      this.ticket = null;
      this.form.reset({
        ticketCode: '',
        description: '',
        ticketStateTypeId: this.ticketStateTypes[0]?.value ?? 0,
        permissionToEnter: false,
        ownerContacted: false,
        confirmedWithTenant: false,
        followedUpWithOwner: false,
        workOrderCompleted: false,
        isActive: true
      }, { emitEvent: false });
      this.itemsToLoad$.next(new Set());
      return;
    }

    this.ticket = this.getMockTicketById(id);
    if (!this.ticket) {
      this.isServiceError = true;
      this.itemsToLoad$.next(new Set());
      return;
    }

    this.populateForm(this.ticket);
    this.itemsToLoad$.next(new Set());
  }

  saveTicket(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    setTimeout(() => {
      this.isSubmitting = false;
      this.toastr.success(
        this.isAddMode ? 'Ticket created successfully' : 'Ticket updated successfully',
        CommonMessage.Success,
        { timeOut: CommonTimeouts.Success }
      );
      this.savedEvent.emit();
      this.backEvent.emit();
    }, 50);
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      ticketCode: new FormControl('', [Validators.required]),
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
    this.form.patchValue({
      ticketCode: ticket.TicketCode || '',
      description: ticket.Description || '',
      ticketStateTypeId: ticket.ticketStateTypeId,
      permissionToEnter: ticket.permissionToEnter,
      ownerContacted: ticket.ownerContacted,
      confirmedWithTenant: ticket.confirmedWithTenant,
      followedUpWithOwner: ticket.followedUpWithOwner,
      workOrderCompleted: ticket.workOrderCompleted,
      isActive: ticket.IsActive
    }, { emitEvent: false });
  }
  //#endregion

  //#region Utility Methods
  getMockTicketById(id: string | number | null): TicketResponse | null {
    const normalizedId = Number(id);
    if (Number.isNaN(normalizedId)) {
      return null;
    }

    const mockTickets: TicketResponse[] = [
      {
        ticketId: 1001,
        organizationId: '',
        officeId: 0,
        officeName: '',
        propertyId: 'P-001',
        PropertyCode: 'P-001',
        ReservationId: 'R-001',
        ReservationCode: 'R-001',
        TicketCode: 'T-001',
        Description: 'HVAC not cooling in primary bedroom',
        ticketStateTypeId: 0,
        permissionToEnter: true,
        ownerContacted: false,
        confirmedWithTenant: true,
        followedUpWithOwner: false,
        workOrderCompleted: false,
        Notes: null,
        IsActive: true
      }
    ];

    return mockTickets.find(ticket => ticket.ticketId === normalizedId) || null;
  }

  back(): void {
    this.backEvent.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
