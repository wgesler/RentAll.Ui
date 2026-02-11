import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { VendorRequest, VendorResponse } from '../models/vendor.model';

@Injectable({
    providedIn: 'root'
})

export class VendorService {
  
  private readonly controller = this.configService.config().apiUrl + 'vendor/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all vendors
  getVendors(): Observable<VendorResponse[]> {
    return this.http.get<VendorResponse[]>(this.controller);
  }

  // GET: Get vendor by ID
  getVendorByGuid(vendorId: string): Observable<VendorResponse> {
    return this.http.get<VendorResponse>(this.controller + vendorId);
  }

  // POST: Create a new vendor
  createVendor(vendor: VendorRequest): Observable<VendorResponse> {
    return this.http.post<VendorResponse>(this.controller, vendor);
  }

  // PUT: Update entire vendor
  updateVendor(vendor: VendorRequest): Observable<VendorResponse> {
    return this.http.put<VendorResponse>(this.controller, vendor);
  }

  // DELETE: Delete vendor
  deleteVendor(vendorId: string): Observable<void> {
    return this.http.delete<void>(this.controller + vendorId);
  }
}

