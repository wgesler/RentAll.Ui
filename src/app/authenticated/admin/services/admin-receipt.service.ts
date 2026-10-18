import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';

export interface MissingReceipt {
  receiptId: string;
  officeId: number;
  officeName: string;
  receiptCode: string;
  receiptDate: string;
  amount: number;
  vendorName: string | null;
  description: string;
  receiptPath: string | null;
  noReceiptAvailable: boolean;
}

export interface UnassignedReceiptImage {
  path: string;
  fileName: string;
  contentType: string;
  dataUrl: string | null;
  thumbnailUrl?: string | null;
}

export interface UnmatchedReceipts {
  receipts: MissingReceipt[];
  images: UnassignedReceiptImage[];
}

@Injectable({ providedIn: 'root' })
export class AdminReceiptService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private readonly controller = this.configService.config().apiUrl + 'admin/receipts/';

  getUnmatched(organizationId: string, officeId: number | null, start: string | null, end: string | null): Observable<UnmatchedReceipts> {
    let params = new HttpParams().set('organizationId', organizationId);
    if (officeId != null) {
      params = params.set('officeId', String(officeId));
    }
    if (start) {
      params = params.set('start', start);
    }
    if (end) {
      params = params.set('end', end);
    }
    return this.http.get<UnmatchedReceipts>(this.controller + 'unmatched', { params });
  }

  getFiles(organizationId: string, officeId: number | null): Observable<UnassignedReceiptImage[]> {
    let params = new HttpParams().set('organizationId', organizationId);
    if (officeId != null) {
      params = params.set('officeId', String(officeId));
    }
    return this.http.get<UnassignedReceiptImage[]>(this.controller + 'files', { params });
  }

  match(organizationId: string, receiptId: string, sourcePath: string): Observable<{ receiptPath: string }> {
    return this.http.post<{ receiptPath: string }>(this.controller + 'match', { organizationId, receiptId, sourcePath });
  }

  getImage(organizationId: string, path: string): Observable<{ fileName: string; contentType: string; dataUrl: string }> {
    const params = new HttpParams().set('organizationId', organizationId).set('path', path);
    return this.http.get<{ fileName: string; contentType: string; dataUrl: string }>(this.controller + 'image', { params });
  }
}
