import { StorageKey } from '../../enums/storage-keys.enum';
import { StorageService } from '../../services/storage.service';

export function isUsingMobileDevice(storageService: StorageService): boolean {
  return storageService.getItem(StorageKey.UsingMobileDevice) === '1';
}

export function setUsingMobileDevice(storageService: StorageService, usingMobileDevice: boolean): void {
  if (usingMobileDevice) {
    storageService.addItem(StorageKey.UsingMobileDevice, '1');
    return;
  }
  storageService.removeItem(StorageKey.UsingMobileDevice);
}
