import { Inject, Injectable, Optional } from '@angular/core';
import { Observable, of } from 'rxjs';
import { FORM_TOKEN_PROVIDERS, FormTokenProvider, FormTokenProviderInputs } from './form-token-provider';

@Injectable()
export class FormTokenProviderRegistryService {
  private readonly providerMap = new Map<string, FormTokenProvider>();

  constructor(@Optional() @Inject(FORM_TOKEN_PROVIDERS) providers: FormTokenProvider[] | null) {
    (providers || []).forEach(provider => {
      const key = String(provider.contextType || '').trim().toLowerCase();
      if (!key) {
        return;
      }
      this.providerMap.set(key, provider);
    });
  }

  applyTokens(contextType: string | null | undefined, templateHtml: string, inputs: FormTokenProviderInputs): Observable<string> {
    const key = String(contextType || '').trim().toLowerCase();
    if (!key) {
      return of(templateHtml);
    }
    const provider = this.providerMap.get(key);
    if (!provider) {
      return of(templateHtml);
    }
    return provider.applyTokens(templateHtml, inputs);
  }
}
