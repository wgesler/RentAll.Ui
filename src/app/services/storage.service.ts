import { Injectable } from '@angular/core';
import { StorageKey } from '../enums/storage-keys.enum';

@Injectable({
    providedIn: 'root'
})
export class StorageService {

    constructor() {}

    getItem(key: StorageKey): string | null {
        return localStorage.getItem(key);
    }

    removeItem(key: StorageKey): void {
        localStorage.removeItem(key);
    }

    addItem(key: StorageKey, data: string): void {
        localStorage.setItem(key, data);
    }
}