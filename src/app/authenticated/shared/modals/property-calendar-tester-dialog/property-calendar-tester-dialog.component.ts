import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize, take } from 'rxjs';
import { MaterialModule } from '../../../../material.module';

export interface PropertyCalendarTesterDialogData {
  initialUrl?: string | null;
}

type ParsedCalendarEvent = {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
  location: string;
  description: string;
};

@Component({
  standalone: true,
  selector: 'app-property-calendar-tester-dialog',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './property-calendar-tester-dialog.component.html',
  styleUrl: './property-calendar-tester-dialog.component.scss'
})
export class PropertyCalendarTesterDialogComponent implements OnInit {
  form: FormGroup;
  isLoading = false;
  fetchUrl = '';
  statusCode: number | null = null;
  contentType = '';
  rawResponse = '';
  fullHttpResponse = '';
  lineCount = 0;
  eventCount = 0;
  parsedEvents: ParsedCalendarEvent[] = [];
  errorMessage = '';

  get prettyRawResponse(): string {
    return this.prettyPrintText(this.rawResponse, '[empty response body]');
  }

  get prettyFullHttpResponse(): string {
    return this.prettyPrintText(this.fullHttpResponse, '[no response object]');
  }

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<PropertyCalendarTesterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PropertyCalendarTesterDialogData
  ) {}

  //#region Calendar-Tester-Dialog
  ngOnInit(): void {
    this.form = this.fb.group({
      url: new FormControl(this.data?.initialUrl ?? '', [Validators.required])
    });
  }

  runTest(): void {
    const enteredUrl = String(this.form.get('url')?.value || '').trim();
    if (!enteredUrl) {
      return;
    }

    this.resetResult();
    this.fetchUrl = this.normalizeCalendarUrl(enteredUrl);
    this.isLoading = true;

    this.http.get(this.fetchUrl, { observe: 'response', responseType: 'text' }).pipe(
      take(1),
      finalize(() => { this.isLoading = false; })
    ).subscribe({
      next: (response: HttpResponse<string>) => this.handleSuccessResponse(response),
      error: (error: HttpErrorResponse) => this.handleErrorResponse(error)
    });
  }

  close(): void {
    this.dialogRef.close();
  }
  //#endregion

  //#region Form Methods
  normalizeCalendarUrl(url: string): string {
    if (url.toLowerCase().startsWith('webcal://')) {
      return `https://${url.substring('webcal://'.length)}`;
    }
    return url;
  }

  resetResult(): void {
    this.statusCode = null;
    this.contentType = '';
    this.rawResponse = '';
    this.fullHttpResponse = '';
    this.lineCount = 0;
    this.eventCount = 0;
    this.parsedEvents = [];
    this.errorMessage = '';
  }
  //#endregion

  //#region Utility Methods
  handleSuccessResponse(response: HttpResponse<string>): void {
    const responseBody = response.body || '';
    this.statusCode = response.status;
    this.contentType = response.headers.get('content-type') || '';
    this.rawResponse = responseBody;
    this.fullHttpResponse = this.serializeForDisplay(response);
    this.lineCount = this.getUnfoldedLines(responseBody).length;
    this.parsedEvents = this.parseIcalEvents(responseBody);
    this.eventCount = this.parsedEvents.length;
  }

  handleErrorResponse(error: HttpErrorResponse): void {
    this.statusCode = error.status ?? null;
    this.contentType = error.headers?.get?.('content-type') || '';
    this.rawResponse = typeof error.error === 'string' ? error.error : '';
    this.fullHttpResponse = this.serializeForDisplay(error);
    this.lineCount = this.rawResponse ? this.getUnfoldedLines(this.rawResponse).length : 0;
    this.parsedEvents = this.rawResponse ? this.parseIcalEvents(this.rawResponse) : [];
    this.eventCount = this.parsedEvents.length;
    this.errorMessage = error.message || 'Request failed.';
  }

  serializeForDisplay(value: unknown): string {
    try {
      return JSON.stringify(value, (_key, currentValue) => {
        if (currentValue instanceof HttpHeaders) {
          const headerMap: Record<string, string | null> = {};
          for (const headerName of currentValue.keys()) {
            headerMap[headerName] = currentValue.get(headerName);
          }
          return headerMap;
        }

        if (currentValue instanceof Error) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack
          };
        }

        return currentValue;
      }, 2);
    } catch {
      return '[Unable to serialize full HttpResponse]';
    }
  }

  parseIcalEvents(icalText: string): ParsedCalendarEvent[] {
    const lines = this.getUnfoldedLines(icalText);
    const events: ParsedCalendarEvent[] = [];
    let currentEvent: ParsedCalendarEvent | null = null;

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        currentEvent = {
          uid: '',
          summary: '',
          dtstart: '',
          dtend: '',
          location: '',
          description: ''
        };
        continue;
      }

      if (line === 'END:VEVENT') {
        if (currentEvent) {
          events.push({
            ...currentEvent,
            dtstart: this.formatIcalDate(currentEvent.dtstart),
            dtend: this.formatIcalDate(currentEvent.dtend)
          });
        }
        currentEvent = null;
        continue;
      }

      if (!currentEvent) {
        continue;
      }

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }

      const namePart = line.substring(0, separatorIndex);
      const valuePart = line.substring(separatorIndex + 1);
      const propertyName = namePart.split(';')[0].toUpperCase();

      switch (propertyName) {
        case 'UID':
          currentEvent.uid = valuePart;
          break;
        case 'SUMMARY':
          currentEvent.summary = valuePart;
          break;
        case 'DTSTART':
          currentEvent.dtstart = valuePart;
          break;
        case 'DTEND':
          currentEvent.dtend = valuePart;
          break;
        case 'LOCATION':
          currentEvent.location = valuePart;
          break;
        case 'DESCRIPTION':
          currentEvent.description = valuePart;
          break;
        default:
          break;
      }
    }

    return events;
  }

  getUnfoldedLines(icalText: string): string[] {
    const normalized = (icalText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const physicalLines = normalized.split('\n');
    const unfoldedLines: string[] = [];

    for (const line of physicalLines) {
      if ((line.startsWith(' ') || line.startsWith('\t')) && unfoldedLines.length > 0) {
        unfoldedLines[unfoldedLines.length - 1] += line.substring(1);
      } else {
        unfoldedLines.push(line);
      }
    }

    return unfoldedLines.filter(line => line.length > 0);
  }

  formatIcalDate(value: string): string {
    if (!value) {
      return '';
    }

    if (/^\d{8}$/.test(value)) {
      const year = Number(value.substring(0, 4));
      const month = Number(value.substring(4, 6)) - 1;
      const day = Number(value.substring(6, 8));
      const date = new Date(year, month, day);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
    }

    if (/^\d{8}T\d{6}Z?$/.test(value)) {
      const year = Number(value.substring(0, 4));
      const month = Number(value.substring(4, 6)) - 1;
      const day = Number(value.substring(6, 8));
      const hours = Number(value.substring(9, 11));
      const minutes = Number(value.substring(11, 13));
      const seconds = Number(value.substring(13, 15));
      const isUtc = value.endsWith('Z');
      const date = isUtc
        ? new Date(Date.UTC(year, month, day, hours, minutes, seconds))
        : new Date(year, month, day, hours, minutes, seconds);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    return value;
  }

  prettyPrintText(value: string, fallbackText: string): string {
    const normalizedValue = String(value ?? '');
    const trimmedValue = normalizedValue.trim();
    if (!trimmedValue) {
      return fallbackText;
    }

    try {
      return JSON.stringify(JSON.parse(trimmedValue), null, 2);
    } catch {
      return normalizedValue.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
  }
  //#endregion
}
