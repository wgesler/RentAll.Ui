import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ApplicationLogResponse } from '../models/log.model';

/** A JSON body stored in the log row's Properties (e.g. an EasyPay request or response), shown formatted. */
interface LogJsonBlock {
  label: string;
  text: string;
  copied: boolean;
}

@Component({
  standalone: true,
  selector: 'app-application-log',
  templateUrl: './application-log.component.html',
  styleUrl: './application-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class ApplicationLogComponent implements OnInit, OnDestroy {
  @Input() row: ApplicationLogResponse | null = null;
  @Output() closed = new EventEmitter<void>();

  /** Properties that hold whole bodies, each shown in its own copyable block (e.g. [EasyPayLog] Request/Response). */
  private static readonly BodyProperties: Record<string, string> = {
    Request: 'Request sent to EasyPay',
    Response: 'Response from EasyPay',
    Body: 'Body received from EasyPay'
  };

  jsonBlocks: LogJsonBlock[] = [];

  constructor() {}

  //#region Application-Log
  ngOnInit(): void {
    this.jsonBlocks = this.buildJsonBlocks();
  }
  //#endregion

  //#region Utility Methods
  /** Pulls Request/Response/Body out of Properties and pretty-prints any JSON so it can be read and copied. */
  buildJsonBlocks(): LogJsonBlock[] {
    const raw = (this.row as { properties?: string | null } | null)?.properties;
    if (!raw) {
      return [];
    }
    let properties: Record<string, unknown>;
    try {
      properties = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return [];
    }
    // "Body" is what EasyPay sent us on a webhook row ([NumberPayment] Step=Raw), but what we sent on a
    // [NumberPayFormTrace] row.
    const message = this.row?.message ?? '';
    const bodyLabel = message.startsWith('[NumberPayment]') ? 'Body received from EasyPay' : 'Request sent to EasyPay';
    return Object.entries(ApplicationLogComponent.BodyProperties)
      .filter(([key]) => typeof properties[key] === 'string' && (properties[key] as string).trim() !== '')
      .map(([key, label]) => ({ label: key === 'Body' ? bodyLabel : label, text: this.prettyJson(properties[key] as string), copied: false }));
  }

  prettyJson(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  copy(block: LogJsonBlock): void {
    navigator.clipboard.writeText(block.text).then(() => {
      block.copied = true;
      setTimeout(() => (block.copied = false), 2000);
    });
  }

  back(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {}
  //#endregion
}
