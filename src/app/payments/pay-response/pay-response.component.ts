import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { take } from 'rxjs';
import { PayResponseMessage, PayResponseMessageType, PayResponseResponse } from '../models/pay-request.model';
import { PayRequestService } from '../services/pay-request.service';

/**
 * Where Number sends the payer after the form is submitted (payments/pay-response/{token}?TXID=..&CID=..).
 * Public. It has the API confirm and save the result, then:
 *  - inside the pay-request page's iFrame (the normal case), posts the result to that page;
 *  - opened on its own, shows the result with a link to the company's website.
 */
@Component({
  standalone: true,
  selector: 'app-pay-response',
  imports: [CommonModule, MatIconModule],
  templateUrl: './pay-response.component.html',
  styleUrl: './pay-response.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayResponseComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private payRequestService = inject(PayRequestService);
  private cdr = inject(ChangeDetectorRef);

  isLoading = true;
  errorMessage = '';
  result: PayResponseResponse | null = null;
  readonly inFrame = window.parent !== window;

  ngOnInit(): void {
    const token = (this.route.snapshot.paramMap.get('token') || '').trim();
    const query = this.route.snapshot.queryParamMap;
    const txId = query.get('TXID');
    const consentId = query.get('CID');

    if (!token) {
      this.isLoading = false;
      this.errorMessage = 'This page was opened without a payment link code.';
      return;
    }

    this.payRequestService.sendPayResponse(token, txId, consentId).pipe(take(1)).subscribe({
      next: (result) => {
        this.result = result;
        this.isLoading = false;
        this.notifyParent(result);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        this.errorMessage = typeof err?.error === 'string' && err.error.trim() ? err.error : 'Your details could not be confirmed. Please contact us.';
        this.notifyParent({ saved: false, consentId: Number(consentId) || 0, message: this.errorMessage });
        this.cdr.markForCheck();
      }
    });
  }

  /** Tell the pay-request page (the page holding this frame) what happened. */
  notifyParent(result: PayResponseResponse): void {
    if (!this.inFrame) {
      return;
    }
    const message: PayResponseMessage = { type: PayResponseMessageType, result };
    // "*": after Number redirects the frame here, the browser may give this frame an opaque origin, and a message
    // addressed to our own origin is then silently dropped. The pay-request page only accepts it from its own frame.
    window.parent.postMessage(message, "*");
  }
}
