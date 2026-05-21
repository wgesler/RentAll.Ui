import { Injectable } from '@angular/core';
import { FormTokenReplacerService } from '../../shared/forms/services/form-token-replacer.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerFormPlaceholderService extends FormTokenReplacerService {}
