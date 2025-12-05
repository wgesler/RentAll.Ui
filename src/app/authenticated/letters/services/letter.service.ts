import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { CombinedLetterResponse, LetterResponse, LetterUpdateRequest } from '../models/letter.model';

@Injectable({
  providedIn: 'root'
})
export class LetterService {

  private readonly controller = this.configService.config().apiUrl + 'letters/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService) {
  }

  getLetters(): Observable<LetterResponse[]> {
    return this.http.get<LetterResponse[]>(this.controller);
  }

  getValidStates(): Observable<string[]> {
    return this.http.get<string[]>(this.controller + 'states');
  }

  getLetterByState(state: string): Observable<CombinedLetterResponse> {
    return this.http.get<CombinedLetterResponse>(this.controller + state);
  }

  addOrUpdateLetter(letterUpdateRequest: LetterUpdateRequest): Observable<LetterResponse> {
    return this.http.put<LetterResponse>(this.controller, letterUpdateRequest);
  }

  deleteLetterByState(state: string): Observable<boolean> {
    return this.http.delete<boolean>(this.controller + state);
  }
}
