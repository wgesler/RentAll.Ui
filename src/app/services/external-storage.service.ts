import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';
@Injectable({
    providedIn: 'root'
})
export class ExternalStorageService {
    private readonly controller = 'storage/';
    

    constructor(private http: HttpClient, private configService: ConfigService) { }

    getPrivateFileUrl(fileGuid: string): string {
        return fileGuid !== '' ? `${this.configService.config().apiUrl}${this.controller}${fileGuid}/private/` : '';
    }

    getPublicFileUrl(fileGuid: string): Observable<string> {
        return this.http.get<string>(`${this.configService.config().apiUrl}${this.controller}${fileGuid}/url`);
    }
}