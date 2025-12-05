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
                const firstFourBytes = value.slice(0, 4);

                const isFileMimeTypeValid = await checkFileHeader(firstFourBytes, allowedMimeTypes);
                if (isFileMimeTypeValid)
                    return null;
                return { fileValidator: true };
            }
        }

        return null;
    };
}


function checkFileHeader(fileHeaderBytes: Blob, allowedMimeTypes: string[]): Promise<boolean> {
    const fileReader = new FileReader();

    return new Promise((resolve) => {
        fileReader.onloadend = function (e): void {
            if (e.target.readyState === FileReader.DONE) {
                const uintArray = new Uint8Array(e.target.result as ArrayBuffer);
                const bytesToCheck = [];
                uintArray.forEach((byte) => {
                    bytesToCheck.push(byte.toString(16));
                });

                const header = bytesToCheck.join('').toLowerCase();
                let fileType = '';

                switch (header) {
                    case '89504e47':
                        fileType = 'image/png';
                        break;
                    case '47494638':
                        fileType = 'image/gif';
                        break;
                    case 'ffd8ffe0':
                    case 'ffd8ffe1':
                    case 'ffd8ffe2':
                    case 'ffd8ffe3':
                    case 'ffd8ffe8':
                    case 'ffd8ffdb':
                        fileType = 'image/jpeg';
                        break;
                    default:
                        fileType = '';
                }

                if (allowedMimeTypes.lastIndexOf(fileType) === -1)
                    resolve(false);

                resolve(true);
            }

            resolve(false);
        };

        fileReader.readAsArrayBuffer(fileHeaderBytes);
    });
}