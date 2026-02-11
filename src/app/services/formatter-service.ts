import { DatePipe, DecimalPipe, } from '@angular/common';
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

    // Formats a date string to MM/DD/YYYY hh:mm AM/PM format
    formatDateTimeString(dateString?: string): string {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return '';
            }
            return this.datePipe.transform(date, 'MM/dd/yyyy hh:mm a') || '';
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
    // Formats a phone number - supports US (10 digits) and international (up to 15 digits)
    // US format: (XXX) XXX-XXXX
    // International format: Returns exactly as stored (no auto-formatting)
    phoneNumber(phone?: string): string {
        if (!phone) return phone || '';
        const trimmed = phone.trim();
        
        // If starts with +, return as-is (international numbers stored exactly as typed)
        if (trimmed.startsWith('+')) {
            return phone;
        }
        
        // For US numbers (10 digits), format as (XXX) XXX-XXXX
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
        }
        
        // Return original if it doesn't match standard formats
        return phone;
    }

    // Removes all non-digit characters from a phone number string
    // For international numbers (starting with +), preserves the original format exactly as typed
    // For US numbers, strips formatting to digits only
    stripPhoneFormatting(phone: string): string {
        if (!phone) return '';
        const trimmed = phone.trim();
        
        // If starts with +, return exactly as typed (international numbers stored as-is)
        if (trimmed.startsWith('+')) {
            return trimmed;
        }
        
        // For US numbers, strip all formatting and return digits only
        return phone.replace(/\D/g, '');
    }

    // Formats a phone number on blur (when user leaves the field)
    // Only formats US numbers (10 digits). International numbers (starting with +) are stored exactly as typed
    formatPhoneControl(control: AbstractControl | null): void {
        if (control && control.value) {
            const value = control.value.toString().trim();
            
            // If starts with +, don't format - store exactly as typed
            if (value.startsWith('+')) {
                control.setValue(value, { emitEvent: false });
                return;
            }
            
            // For US numbers (10 digits), format as (XXX) XXX-XXXX
            const digits = value.replace(/\D/g, '');
            if (digits.length === 10) {
                const formatted = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
                control.setValue(formatted, { emitEvent: false });
            }
        }
    }

    // Handles phone number input formatting in real-time as user types
    // For US numbers (10 digits): auto-formats as (XXX) XXX-XXXX
    // For international numbers (starting with +): allows free-form input (digits, spaces, +) - stores exactly as typed
    formatPhoneInput(event: Event, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const value = input.value;
        const trimmed = value.trim();
        const hasPlus = trimmed.startsWith('+');
        
        // If starts with +, allow free-form input (digits, spaces, +) - don't auto-format
        if (hasPlus) {
            // Allow only digits, spaces, and + character
            const cleaned = value.replace(/[^0-9+\s]/g, '');
            // Ensure + is only at the start
            const parts = cleaned.split('+');
            const finalValue = parts.length > 1 ? '+' + parts.slice(1).join('').replace(/\+/g, '') : cleaned;
            
            input.value = finalValue;
            if (control) {
                control.setValue(finalValue, { emitEvent: false });
            }
            return;
        }
        
        // For US numbers (no +), auto-format as (XXX) XXX-XXXX
        const digits = value.replace(/\D/g, '');
        
        if (digits.length <= 10) {
            let formatted = '';
            if (digits.length > 6) {
                formatted = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
            } else if (digits.length > 3) {
                formatted = `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
            } else if (digits.length > 0) {
                formatted = `(${digits}`;
            }
            
            input.value = formatted;
            if (control) {
                control.setValue(formatted, { emitEvent: false });
            }
        }
    }

    /*******************  Code Input Formatting *******************/
    // Handles uppercase code input formatting (for officeCode, agentCode, regionCode, areaCode, buildingCode, etc.)
    // Converts input to uppercase while preserving cursor position
    formatCodeInput(event: Event, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const cursorPosition = input.selectionStart || 0;
        const originalValue = input.value;
        const upperValue = originalValue.toUpperCase();
        
        // Only update if the value actually changed (case-wise)
        if (originalValue !== upperValue) {
            // Update form control value
            if (control) {
                control.setValue(upperValue, { emitEvent: false });
            }
            
            // Set the input value and immediately restore cursor position
            // This prevents the cursor from jumping to the end
            input.value = upperValue;
            input.setSelectionRange(cursorPosition, cursorPosition);
        }
    }
}