import { DatePipe, DecimalPipe,  } from '@angular/common';
import { Injectable } from '@angular/core';
import { AbstractControl } from '@angular/forms';

@Injectable({
    providedIn: 'root'
})

export class FormatterService {
    constructor(private decimalPipe: DecimalPipe, private datePipe: DatePipe) {}

    currency(value: number): string {
        return this.decimalPipe.transform(value === null ? 0 : value, '1.2-2');
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

    
    /*******************  Dates *******************/
    // Formats a date to MM/DD/YYYY hh:mm AM/PM format
    date(value: Date): string {
        return this.datePipe.transform(value, 'MM/dd/yyyy hh:mm a');
    }

    // Formats a date to MM/DD/YYYY format
    dateOnly(value: Date): string {
        const convert = new Date(value);
        if (convert.getUTCHours() + convert.getUTCMinutes() + convert.getUTCSeconds() === 0){
            return this.datePipe.transform(value, 'MM/dd/yyyy', '+0000');
        }
        return this.datePipe.transform(value, 'MM/dd/yyyy');
    }

    // Formats a date string to MM/DD/YYYY format
    formatDateString(dateString?: string): string {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return '';
            }
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${month}/${day}/${year}`;
        } catch {
            return '';
        }
    }

    // Formats a date string to long format (e.g., "December 25, 2023")
    formatDateStringLong(dateString?: string): string {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch {
            return dateString || '';
        }
    }


    /*******************  Decimal/Number Formatting *******************/
    // Formats a decimal control value to 2 decimal places on blur (e.g., "0.00")
    formatDecimalControl(control: AbstractControl | null): void {
        if (control && control.value !== null && control.value !== '') {
            const value = parseFloat(control.value.toString().replace(/[^0-9.]/g, ''));
            if (!isNaN(value)) {
                const formatted = value.toFixed(2);
                control.setValue(formatted, { emitEvent: false });
            } else {
                control.setValue('0.00', { emitEvent: false });
            }
        } else {
            control?.setValue('0.00', { emitEvent: false });
        }
    }

    // Handles decimal input formatting in real-time as user types
    formatDecimalInput(event: Event, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const value = input.value.replace(/[^0-9.]/g, '');
        
        // Allow only one decimal point
        const parts = value.split('.');
        if (parts.length > 2) {
            input.value = parts[0] + '.' + parts.slice(1).join('');
        } else {
            input.value = value;
        }
        
        if (control) {
            control.setValue(input.value, { emitEvent: false });
        }
    }

    
    /*******************  Phone Numbers *******************/
    // Formats a phone number to (XXX) XXX-XXXX
    phoneNumber(phone?: string): string {
        if (!phone) return phone || '';
        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
        }
        return phone;
    }

    // Removes all non-digit characters from a phone number string
    stripPhoneFormatting(phone: string): string {
        if (!phone) return '';
        return phone.replace(/\D/g, '');
    }

    // Formats a phone number to (XXX) XXX-XXXX on blur (when user leaves the field)
    formatPhoneControl(control: AbstractControl | null): void {
        if (control && control.value) {
            const phone = this.stripPhoneFormatting(control.value);
            if (phone.length === 10) {
                const formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
                control.setValue(formatted, { emitEvent: false });
            }
        }
    }

    // Handles phone number input formatting in real-time as user types
    formatPhoneInput(event: Event, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const phone = this.stripPhoneFormatting(input.value);
        if (phone.length <= 10) {
            let formatted = phone;
            if (phone.length > 6) {
                formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
            } else if (phone.length > 3) {
                formatted = `(${phone.substring(0, 3)}) ${phone.substring(3)}`;
            } else if (phone.length > 0) {
                formatted = `(${phone}`;
            }
            if (control) {
                control.setValue(formatted, { emitEvent: false });
            }
        }
    }
}