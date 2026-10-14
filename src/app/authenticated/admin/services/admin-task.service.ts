import { HttpClient, HttpDownloadProgressEvent, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, concatMap, filter, from, map } from 'rxjs';
import { ConfigService } from '../../../services/config.service';

export interface StorageRepairEvent {
  kind: string;
  file: string;
  status: string;
  detail: string;
  total: number;
  moved: number;
  alreadyCorrect: number;
  removed: number;
  failed: number;
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AdminTaskService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private readonly controller = this.configService.config().apiUrl + 'admin/storage/';

  repair(task: string): Observable<StorageRepairEvent> {
    let consumed = 0;
    return this.http.post(this.controller + task, {}, { observe: 'events', reportProgress: true, responseType: 'text' }).pipe(
      map(event => this.readBody(event)),
      filter((body): body is string => body != null),
      concatMap(body => {
        const end = body.endsWith('\n') ? body.length : body.lastIndexOf('\n') + 1;
        if (end <= consumed) {
          return EMPTY;
        }

        const chunk = body.slice(consumed, end);
        consumed = end;
        const events = chunk.split('\n').filter(line => line.trim().length > 0).map(line => JSON.parse(line) as StorageRepairEvent);
        return from(events);
      })
    );
  }

  private readBody(event: HttpEvent<string>): string | null {
    if (event.type === HttpEventType.DownloadProgress) {
      return (event as HttpDownloadProgressEvent).partialText ?? '';
    }

    if (event.type === HttpEventType.Response) {
      return (event as HttpResponse<string>).body ?? '';
    }

    return null;
  }
}
