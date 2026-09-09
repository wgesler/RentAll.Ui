import { Observable } from 'rxjs';
import { ReceiptResponse } from '../maintenance/models/receipt.model';
import { WorkOrderResponse } from '../maintenance/models/work-order.model';
import { TicketNoteRequest, TicketRequest, TicketResponse } from '../tickets/models/ticket-models';
import { TicketService } from '../tickets/services/ticket.service';

export interface MobileTicketReturnState {
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialReservationId?: string | null;
}

export function getMobileTicketReturnRoute(
  returnTicketId: string | null | undefined,
  returnTicketTab: string | null | undefined
): string[] | null {
  const ticketId = String(returnTicketId ?? '').trim();
  if (!ticketId) {
    return null;
  }

  const tabPath = String(returnTicketTab ?? '').trim() || 'my-tickets';
  return ['/mobile', 'tickets', tabPath, ticketId];
}

export function buildReceiptCreatedTicketComment(receipt: ReceiptResponse): string {
  const description = String(receipt.description || '').trim() || 'Receipt';
  const receiptCode = String(receipt.receiptCode || '').trim();
  return `Receipt Created: ${description}${receiptCode ? ` ${receiptCode}` : ''}`.trim();
}

export function buildWorkOrderCreatedTicketComment(workOrder: WorkOrderResponse): string {
  const workOrderCode = String(workOrder.workOrderCode || '').trim()
    || String(workOrder.workOrderId || '').trim()
    || 'Unknown';
  return `Work Order Created: ${workOrderCode}`;
}

export function appendTicketNote(
  ticketService: TicketService,
  ticket: TicketResponse,
  noteText: string
): Observable<TicketResponse> {
  const trimmedNote = String(noteText || '').trim();
  const existingNotes: TicketNoteRequest[] = (ticket.notes || [])
    .filter(note => Number(note.ticketNoteId) > 0)
    .map(note => ({
      ticketNoteId: note.ticketNoteId,
      ticketId: note.ticketId,
      note: note.note
    }));

  const request: TicketRequest = {
    ticketId: ticket.ticketId,
    organizationId: ticket.organizationId,
    officeId: ticket.officeId,
    propertyId: ticket.propertyId,
    reservationId: ticket.reservationId,
    assigneeId: ticket.assigneeId ?? null,
    agentId: ticket.agentId ?? null,
    ticketCode: ticket.ticketCode,
    title: ticket.title,
    description: ticket.description,
    stepsToReproduce: ticket.stepsToReproduce ?? null,
    ticketStateTypeId: ticket.ticketStateTypeId,
    needPermissionToEnter: !!ticket.needPermissionToEnter,
    permissionGranted: !!ticket.permissionGranted,
    ownerContacted: !!ticket.ownerContacted,
    confirmedWithTenant: !!ticket.confirmedWithTenant,
    followedUpWithOwner: !!ticket.followedUpWithOwner,
    workOrderCompleted: !!ticket.workOrderCompleted,
    isForRentAll: !!ticket.isForRentAll,
    notes: [...existingNotes, {
      ticketId: ticket.ticketId,
      note: trimmedNote
    }],
    isActive: !!ticket.isActive
  };

  return ticketService.updateTicket(request);
}
