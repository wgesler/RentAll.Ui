import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface FormTokenProviderInputs {
  formName: string;
  formKey: string;
  ownerLeadId: number | null;
  officeId: number | null;
  propertyId: string | null;
  templateAssetPath: string | null;
}

export interface FormTokenProvider {
  contextType: string;
  applyTokens(templateHtml: string, inputs: FormTokenProviderInputs): Observable<string>;
}

export const FORM_TOKEN_PROVIDERS = new InjectionToken<FormTokenProvider[]>('FORM_TOKEN_PROVIDERS');
