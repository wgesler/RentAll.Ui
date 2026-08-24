import { Injectable, inject } from '@angular/core';
import { DocumentExportService } from '../../../services/document-export.service';
import { FormatterService } from '../../../services/formatter-service';
import { getTicketStateType } from '../models/ticket-enum';
import { TicketNoteResponse, TicketResponse } from '../models/ticket-models';

export interface TicketPrintOverrides {
  title?: string;
  description?: string;
  ticketStateTypeId?: number;
  assigneeName?: string;
  agentName?: string;
  isActive?: boolean;
  needPermissionToEnter?: boolean;
  permissionGranted?: boolean;
  ownerContacted?: boolean;
  confirmedWithTenant?: boolean;
  followedUpWithOwner?: boolean;
  workOrderCompleted?: boolean;
  lastModifiedDisplay?: string;
}

const COMMUNICATION_STATUS_LABELS: Record<string, string> = {
  needPermissionToEnter: 'Need Permission to Enter',
  permissionGranted: 'Permission Granted',
  ownerContacted: 'Owner Contacted',
  confirmedWithTenant: 'Confirmed with Tenant',
  followedUpWithOwner: 'Followed Up with Owner',
  workOrderCompleted: 'Work Order Completed'
};

@Injectable({ providedIn: 'root' })
export class TicketPrintService {
  private documentExportService = inject(DocumentExportService);
  private formatterService = inject(FormatterService);

  printFromTicket(ticket: TicketResponse, overrides: TicketPrintOverrides = {}): void {
    this.documentExportService.printHTML(this.buildPrintHtml(ticket, overrides));
  }

  buildPrintHtml(ticket: TicketResponse, overrides: TicketPrintOverrides = {}): string {
    const ticketCode = String(ticket.ticketCode || '').trim();
    const ticketStateTypeId = Number(overrides.ticketStateTypeId ?? ticket.ticketStateTypeId ?? 0);
    const assigneeName = String(overrides.assigneeName ?? ticket.assigneeName ?? ticket.assignee ?? '').trim() || 'Unassigned';
    const agentName = String(overrides.agentName ?? ticket.agentName ?? ticket.agent ?? '').trim() || 'None';
    const propertyCode = String(ticket.propertyCode || '').trim() || 'None';
    const reservationCode = String(ticket.reservationCode || '').trim() || 'None';
    const title = String(overrides.title ?? ticket.title ?? '').trim();
    const descriptionHtml = String(overrides.description ?? ticket.description ?? '').trim() || '<p>&nbsp;</p>';
    const isActive = overrides.isActive ?? ticket.isActive;
    const lastModifiedDisplay = overrides.lastModifiedDisplay
      ?? (this.formatterService.formatDateString(String(ticket.modifiedOn || ticket.createdOn || '')) || '');

    const communicationStatuses = Object.entries(COMMUNICATION_STATUS_LABELS)
      .filter(([key]) => {
        const overrideKey = key as keyof TicketPrintOverrides;
        if (overrides[overrideKey] !== undefined) {
          return !!overrides[overrideKey];
        }
        return !!(ticket as unknown as Record<string, boolean>)[key];
      })
      .map(([, label]) => label);

    const commentsHtml = this.buildCommentsHtml(ticket.notes || []);

    return `<!DOCTYPE html>
<html>
  <head>
    <title>Ticket ${this.escapeHtml(ticketCode)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 24px; }
      h1 { font-size: 20px; margin: 0 0 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
      .field-label { font-weight: 600; color: #444; }
      .section { margin-top: 18px; }
      .section-title { font-size: 14px; font-weight: 700; margin: 0 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      .description { line-height: 1.45; }
      .description ul, .description ol { margin: 0 0 8px 20px; padding: 0; }
      .comment { margin-bottom: 10px; }
      .comment-meta { font-size: 11px; color: #555; margin-bottom: 2px; }
      .comment-body { white-space: pre-wrap; }
      .muted { color: #666; }
      ul.status-list { margin: 0; padding-left: 18px; }
    </style>
  </head>
  <body>
    <h1>Ticket ${this.escapeHtml(ticketCode)}</h1>
    <div class="grid">
      <div><span class="field-label">Office:</span> ${this.escapeHtml(String(ticket.officeName || ''))}</div>
      <div><span class="field-label">Property:</span> ${this.escapeHtml(propertyCode)}</div>
      <div><span class="field-label">Reservation:</span> ${this.escapeHtml(reservationCode)}</div>
      <div><span class="field-label">Status:</span> ${this.escapeHtml(getTicketStateType(ticketStateTypeId))}</div>
      <div><span class="field-label">Assignee:</span> ${this.escapeHtml(assigneeName)}</div>
      <div><span class="field-label">Agent:</span> ${this.escapeHtml(agentName)}</div>
      <div><span class="field-label">Last Modified:</span> ${this.escapeHtml(lastModifiedDisplay)}</div>
      <div><span class="field-label">Active:</span> ${isActive ? 'Yes' : 'No'}</div>
    </div>
    <div class="section">
      <div class="section-title">Title</div>
      <div>${this.escapeHtml(title)}</div>
    </div>
    <div class="section">
      <div class="section-title">Communication Status</div>
      ${communicationStatuses.length > 0
        ? `<ul class="status-list">${communicationStatuses.map(status => `<li>${this.escapeHtml(status)}</li>`).join('')}</ul>`
        : '<p class="muted">None checked</p>'}
    </div>
    <div class="section">
      <div class="section-title">Description</div>
      <div class="description">${descriptionHtml}</div>
    </div>
    <div class="section">
      <div class="section-title">Comments</div>
      ${commentsHtml}
    </div>
  </body>
</html>`;
  }

  private buildCommentsHtml(notes: TicketNoteResponse[]): string {
    const displayNotes = (notes || [])
      .filter(note => !!String(note.note || '').trim())
      .map(note => {
        const noteText = String(note.note || '').trim();
        const linked = this.parseLinkedTicketNote(noteText);
        const displayText = linked
          ? `${linked.type === 'receipt' ? 'Receipt Created' : 'Work Order Created'}: ${linked.prefix ? `${linked.prefix} ` : ''}${linked.code}`
          : noteText;
        return {
          author: String(note.createdByName || note.modifiedByName || note.createdBy || note.modifiedBy || '').trim() || 'Unknown',
          createdOn: this.formatterService.formatDateTimeString(note.createdOn) || '',
          note: displayText,
          createdOnRaw: String(note.createdOn || '')
        };
      })
      .sort((a, b) => (Date.parse(b.createdOnRaw) || 0) - (Date.parse(a.createdOnRaw) || 0));

    if (displayNotes.length === 0) {
      return '<p class="muted">No comments</p>';
    }

    return displayNotes.map(note => `<div class="comment">
      <div class="comment-meta">${this.escapeHtml(note.author)} | ${this.escapeHtml(note.createdOn)}</div>
      <div class="comment-body">${this.escapeHtml(note.note)}</div>
    </div>`).join('');
  }

  private parseLinkedTicketNote(noteText: string): { type: 'receipt' | 'workOrder'; code: string; prefix?: string | null } | null {
    const receiptPrefix = 'Receipt Created:';
    const workOrderPrefix = 'Work Order Created:';
    if (noteText.startsWith(receiptPrefix)) {
      const remainder = noteText.substring(receiptPrefix.length).trim();
      const noMatch = remainder.match(/^(.*?)(No:\s*\d+)\s*$/i);
      if (noMatch?.[2]) {
        return { type: 'receipt', code: noMatch[2].trim(), prefix: (noMatch[1] || '').trim() || null };
      }
      return remainder ? { type: 'receipt', code: remainder, prefix: null } : null;
    }
    if (noteText.startsWith(workOrderPrefix)) {
      const code = noteText.substring(workOrderPrefix.length).trim();
      return code ? { type: 'workOrder', code } : null;
    }
    return null;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
