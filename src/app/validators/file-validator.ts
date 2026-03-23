import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';

export function fileValidator(allowedTypes: string[],
    allowedMimeTypes: string[],
    maxFileSizeBytes: number = 1000000,
    checkFileContent: boolean = false): AsyncValidatorFn   {

    return async (control: AbstractControl) : Promise<ValidationErrors | null> => {
        const value = control.value as File;

        if (!value || (allowedTypes.length === 0 && !checkFileContent)) {
            return null;
        }

        //check file extension
        const extList = value.name.split('.');
        const ext = extList[extList.length-1].toLowerCase();
        if (allowedTypes.lastIndexOf(ext) === -1) {
            return {
                fileValidator: true
            };
        }

        //check file size
        if (value.size > maxFileSizeBytes) {
            return {
                fileValidator: true
            };
        }

        //check file content if possible
        if (checkFileContent) {
            if (window.FileReader && window.Blob) {
                const isFileMimeTypeValid = await checkFileHeader(value, allowedMimeTypes);
                if (isFileMimeTypeValid)
                    return null;
                return { fileValidator: true };
            }
        }

        return null;
    };
}


function checkFileHeader(file: File, allowedMimeTypes: string[]): Promise<boolean> {
    const fileReader = new FileReader();

    return new Promise((resolve) => {
        fileReader.onloadend = function (e): void {
            if (e.target.readyState === FileReader.DONE) {
                const uintArray = new Uint8Array(e.target.result as ArrayBuffer);
                const header = Array.from(uintArray).map((byte) => byte.toString(16).padStart(2, '0')).join('').toLowerCase();
                const ascii = Array.from(uintArray).map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ')).join('');
                const normalizedText = (() => {
                    try {
                        return new TextDecoder('utf-8', { fatal: false }).decode(uintArray).trim().toLowerCase();
                    } catch {
                        return ascii.trim().toLowerCase();
                    }
                })();
                let fileType = '';

                if (header.startsWith('89504e47')) {
                    fileType = 'image/png';
                } else if (header.startsWith('47494638')) {
                    fileType = 'image/gif';
                } else if (
                    header.startsWith('ffd8ffe0') ||
                    header.startsWith('ffd8ffe1') ||
                    header.startsWith('ffd8ffe2') ||
                    header.startsWith('ffd8ffe3') ||
                    header.startsWith('ffd8ffe8') ||
                    header.startsWith('ffd8ffdb')
                ) {
                    fileType = 'image/jpeg';
                } else if (ascii.length >= 12 && ascii.substring(4, 8) === 'ftyp') {
                    const brand = ascii.substring(8, 12).toLowerCase();
                    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) {
                        fileType = 'image/heic';
                    } else if (['heif', 'heis', 'heim', 'hevm', 'mif1', 'msf1'].includes(brand)) {
                        fileType = 'image/heif';
                    }
                } else if (
                    normalizedText.startsWith('<svg') ||
                    normalizedText.includes('<svg ') ||
                    (normalizedText.startsWith('<?xml') && normalizedText.includes('<svg'))
                ) {
                    fileType = 'image/svg+xml';
                } else if (header.startsWith('25504446')) {
                    fileType = 'application/pdf';
                }

                if (allowedMimeTypes.lastIndexOf(fileType) === -1)
                    resolve(false);

                resolve(true);
            }

            resolve(false);
        };

        fileReader.readAsArrayBuffer(file.slice(0, 512));
    });
}