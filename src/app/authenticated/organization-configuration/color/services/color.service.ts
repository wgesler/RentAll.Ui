import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../../services/config.service';
import { ColorRequest, ColorResponse } from '../models/color.model';

@Injectable({
    providedIn: 'root'
})

export class ColorService {
  
  private readonly controller = this.configService.config().apiUrl + 'color/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all colors
  getColors(): Observable<ColorResponse[]> {
    return this.http.get<ColorResponse[]>(this.controller);
  }

  // GET: Get color by ID
  getColorById(colorId: number): Observable<ColorResponse> {
    return this.http.get<ColorResponse>(this.controller + colorId);
  }

  // POST: Create a new color
  createColor(color: ColorRequest): Observable<ColorResponse> {
    return this.http.post<ColorResponse>(this.controller, color);
  }

  // PUT: Update entire color
  updateColor(color: ColorRequest): Observable<ColorResponse> {
    return this.http.put<ColorResponse>(this.controller, color);
  }

  // DELETE: Delete color
  deleteColor(colorId: number): Observable<void> {
    return this.http.delete<void>(this.controller + colorId);
  }
}


