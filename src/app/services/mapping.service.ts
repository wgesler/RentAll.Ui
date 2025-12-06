import { Injectable } from '@angular/core';
import { CompanyResponse, CompanyListDisplay } from '../authenticated/company/models/company.model';
import { FormatterService } from './formatter-service';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  constructor(private formatter: FormatterService) { }
  
  mapCompanies(companies: CompanyResponse[]): CompanyListDisplay[] {
    return companies.map<CompanyListDisplay>((o: CompanyResponse) => ({
      companyId: o.companyId,
      companyCode: o.companyCode,
      name: o.name,
      city: o.city,
      state: o.state,
      zip: o.zip,
      phone: this.formatPhoneNumber(o.phone),
      website: o.website,
      logoStorageId: o.logoStorageId,
    }));
  }

  formatPhoneNumber(phone?: string): string {
    if (!phone) return phone || '';
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    }
    return phone;
  }
}
