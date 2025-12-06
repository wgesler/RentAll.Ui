import { DatePipe, DecimalPipe,  } from '@angular/common';
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})

export class FormatterService {
    constructor(private decimalPipe: DecimalPipe, private datePipe: DatePipe) {}

    currency(value: number): string {
        return this.decimalPipe.transform(value === null ? 0 : value, '1.2-2');
    }

    date(value: Date): string {
        return this.datePipe.transform(value, 'MM/dd/yyyy hh:mm a');
    }

    dateOnly(value: Date): string {
        const convert = new Date(value);
        if (convert.getUTCHours() + convert.getUTCMinutes() + convert.getUTCSeconds() === 0){
            return this.datePipe.transform(value, 'MM/dd/yyyy', '+0000');
        }
        return this.datePipe.transform(value, 'MM/dd/yyyy');
    }

    percentage(value: number): string{
        return this.decimalPipe.transform(value*100,'1.2-4');
    }

    obfuscator(value: string): string {
        let newValue = '';
        const valueArray = value.split('');
        let i = 0;

        if (valueArray.length < 10) {
            while (i < valueArray.length) {
                if (i < valueArray.length/2) { newValue = newValue.concat('x') }
                else { newValue = newValue.concat(value[i]) }
                i++;
            }
        } else {
            while (i < valueArray.length - 4) {
                newValue = newValue.concat('x');
                i++;
            }
            newValue = newValue + value.substring(value.length-4, value.length);
        }
        return newValue;
    }

    phoneNumber(phone?: string): string {
        if (!phone) return phone || '';
        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
        }
        return phone;
    }
}