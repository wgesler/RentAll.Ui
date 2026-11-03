import { DatePipe, DecimalPipe, } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

type CalendarDateSegment = 'all' | 'month' | 'day' | 'year';

interface CalendarDateEditState {
    segment: CalendarDateSegment;
    month: number;
    day: number;
    year: number;
    monthDigits: string;
    dayDigits: string;
    yearDigits: string;
    pointerDown: boolean;
    empty: boolean;
    valueAtFocus: string;
}

@Injectable({
    providedIn: 'root'
})
export class FormatterService {
    private decimalPipe = inject(DecimalPipe);
    private datePipe = inject(DatePipe);
    private dialog = inject(MatDialog);
    private calendarDateEditStates = new WeakMap<HTMLInputElement, CalendarDateEditState>();


    currency(value: number): string {
        return this.decimalPipe.transform(value === null ? 0 : value, '1.2-2');
    }

    currencyUsd(value: number): string {
        let numeric = Number(value) || 0;
        if (Object.is(numeric, -0)) {
            numeric = 0;
        }
        const absoluteDisplay = this.currency(Math.abs(numeric));
        return numeric < 0 ? `-$${absoluteDisplay}` : `$${absoluteDisplay}`;
    }

    formatPropertyListRate(monthlyRate: number | null | undefined, dailyRate: number | null | undefined): string {
        const monthly = Number(monthlyRate) || 0;
        const daily = Number(dailyRate) || 0;

        if (monthly > 0) {
            const formatted = this.decimalPipe.transform(monthly, '1.0-0') ?? '0';
            return `$${formatted}/m`;
        }

        if (daily > 0) {
            const formatted = this.decimalPipe.transform(daily, '1.0-0') ?? '0';
            return `$${formatted}/d`;
        }

        return '0';
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

    htmlToMultilineText(value?: string | null): string {
        const raw = String(value ?? '');
        if (!raw) {
            return '';
        }

        const normalizedHtml = raw
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/\s*p\s*>/gi, '\n')
            .replace(/<\s*\/\s*div\s*>/gi, '\n')
            .replace(/<\s*\/\s*li\s*>/gi, '\n');

        if (typeof document === 'undefined') {
            return normalizedHtml
                .replace(/<[^>]*>/g, '')
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        const parserNode = document.createElement('div');
        parserNode.innerHTML = normalizedHtml;
        return (parserNode.textContent || parserNode.innerText || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    
    /*******************  Dates *******************/
    /**
     * Parses leading `YYYY-MM-DD` (segment before `T`) as a local calendar day for display.
     * Returns `null` if the prefix is not a valid calendar date.
     */
     parseCalendarPrefixToLocalDate(value?: string | null): Date | null {
        if (value == null || String(value).trim() === '') {
            return null;
        }
        const part = String(value).split('T')[0]?.trim() ?? '';
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
        if (!m) {
            return null;
        }
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
            return null;
        }
        const dt = new Date(y, mo - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
    }

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

    //#region Invoice list formatting

    /** Invoice list: accounting period calendar date as `MM/yyyy`, or em dash when empty. */
    formatInvoiceListAccountingPeriod(accountingPeriod?: string | null): string {
        return this.formatAccountingPeriodMonthYear(accountingPeriod) || '—';
    }

    /** Deposit/transfer list: accounting period as `MM.yy`, or em dash when empty. */
    formatListAccountingPeriodDot(accountingPeriod?: string | null): string {
        return this.formatAccountingPeriodMonthYearDot(accountingPeriod) || '—';
    }

    /** Calendar **DATE** (`YYYY-MM-DD`) → `MM.yy` for compact period display. */
    formatAccountingPeriodMonthYearDot(calendarDate?: string | null): string {
        if (!calendarDate) {
            return '';
        }
        const fromCalendar = this.parseCalendarPrefixToLocalDate(calendarDate);
        if (!fromCalendar) {
            return '';
        }
        const month = `${fromCalendar.getMonth() + 1}`.padStart(2, '0');
        const year = `${fromCalendar.getFullYear()}`.slice(-2);
        return `${month}.${year}`;
    }

    /** Invoice list: created-on `DateTimeOffset` as calendar date `MM/dd/yyyy`, or em dash when empty. */
    formatInvoiceListCreatedOn(createdOn?: string | null): string {
        return this.formatDateTimeOffsetAsDateOnly(createdOn) || '—';
    }

    /** `DateTimeOffset` / ISO string → local calendar date `MM/dd/yyyy` (date portion only). */
    formatDateTimeOffsetAsDateOnly(value?: string | null): string {
        if (!value) {
            return '';
        }
        const fromCalendar = this.parseCalendarPrefixToLocalDate(value);
        if (!fromCalendar) {
            return '';
        }
        return this.datePipe.transform(fromCalendar, 'MM/dd/yyyy') || '';
    }

    /** Calendar **DATE** (`YYYY-MM-DD`) → `MM/yyyy` for accounting period display. */
    formatAccountingPeriodMonthYear(calendarDate?: string | null): string {
        if (!calendarDate) {
            return '';
        }
        const fromCalendar = this.parseCalendarPrefixToLocalDate(calendarDate);
        if (!fromCalendar) {
            return '';
        }
        return this.datePipe.transform(fromCalendar, 'MM/yyyy') || '';
    }

    //#endregion

    /** Calendar / SQL **DATE** string (`YYYY-MM-DD` or ISO with that prefix) → `MM/dd/yyyy`. */
    formatDateString(dateString?: string): string {
        if (!dateString) return '';
        const fromCalendar = this.parseCalendarPrefixToLocalDate(dateString);
        if (fromCalendar) {
            return this.datePipe.transform(fromCalendar, 'MM/dd/yyyy') || '';
        }
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

    /** Calendar / SQL **DATE** string → long US format (e.g. "December 25, 2023"). */
    formatDateStringLong(dateString?: string): string {
        if (!dateString) return '';
        const fromCalendar = this.parseCalendarPrefixToLocalDate(dateString);
        if (fromCalendar) {
            return fromCalendar.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
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

    // Clears the default decimal placeholder (e.g., "0.00") on focus.
    clearDefaultDecimalOnFocus(event: FocusEvent, control: AbstractControl | null, defaultValue: string = '0.00'): void {
        const input = event.target as HTMLInputElement;
        const currentValue = (input?.value ?? '').trim();

        if (currentValue === defaultValue) {
            if (input) {
                input.value = '';
            }
            control?.setValue('', { emitEvent: false });
        }
    }

    // Formats decimal value when Enter is pressed and exits the field.
    formatDecimalOnEnter(event: KeyboardEvent, control: AbstractControl | null): void {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        this.formatDecimalControl(control);
        (event.target as HTMLInputElement)?.blur();
    }

    // Formats decimal value on blur.
    formatDecimalOnBlur(control: AbstractControl | null): void {
        this.formatDecimalControl(control);
    }

    // Formats a currency control value as USD (e.g., "$150.00") on blur.
    formatCurrencyControl(control: AbstractControl | null, defaultWhenEmpty: string | null = '$0.00'): void {
        const raw = (control?.value ?? '').toString().trim();
        if (!raw) {
            if (defaultWhenEmpty === null) {
                control?.setValue('', { emitEvent: false });
                return;
            }
            control?.setValue(defaultWhenEmpty, { emitEvent: false });
            return;
        }
        const normalized = raw.replace(/[$,\s]/g, '');
        const parsed = parseFloat(normalized);
        if (!Number.isFinite(parsed)) {
            if (defaultWhenEmpty === null) {
                control?.setValue('', { emitEvent: false });
                return;
            }
            control?.setValue(defaultWhenEmpty, { emitEvent: false });
            return;
        }
        control?.setValue(this.currencyUsd(parsed), { emitEvent: false });
    }

    // Keeps only numeric currency input (digits + single decimal point).
    formatCurrencyInput(event: Event, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const value = (input.value || '').replace(/[^0-9.]/g, '');
        const parts = value.split('.');
        let sanitized = value;
        if (parts.length > 2) {
            sanitized = parts[0] + '.' + parts.slice(1).join('');
        }
        input.value = sanitized;
        control?.setValue(sanitized, { emitEvent: false });
    }

    // Removes "$" and thousands separators while editing currency values.
    clearCurrencyOnFocus(event: FocusEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const current = (input?.value ?? '').trim();
        if (!current) {
            return;
        }
        const raw = current.replace(/[$,\s]/g, '');
        input.value = raw;
        control?.setValue(raw, { emitEvent: false });
    }

    // Formats currency on Enter and exits the field.
    formatCurrencyOnEnter(event: KeyboardEvent, control: AbstractControl | null, defaultWhenEmpty: string | null = '$0.00'): void {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        this.formatCurrencyControl(control, defaultWhenEmpty);
        (event.target as HTMLInputElement)?.blur();
    }

    // Formats currency value on blur.
    formatCurrencyOnBlur(control: AbstractControl | null, defaultWhenEmpty: string | null = '$0.00'): void {
        this.formatCurrencyControl(control, defaultWhenEmpty);
    }

    // Keeps only numeric percentage input (digits + single decimal point).
    formatPercentageInput(event: Event, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const rawValue = (input.value || '').replace('%', '');
        const value = rawValue.replace(/[^0-9.]/g, '');

        const parts = value.split('.');
        let sanitized = value;
        if (parts.length > 2) {
            sanitized = parts[0] + '.' + parts.slice(1).join('');
        }

        input.value = sanitized;
        control?.setValue(sanitized, { emitEvent: false });
    }

    // Removes the percent suffix while editing.
    clearPercentageOnFocus(event: FocusEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement;
        const current = (input?.value ?? '').trim();
        const raw = current.replace('%', '').trim();
        input.value = raw;
        control?.setValue(raw, { emitEvent: false });
    }

    // Formats numeric percentage as display text (e.g., 25 -> "25%").
    formatPercentageControl(control: AbstractControl | null, defaultValue: number = 25): void {
        const raw = (control?.value ?? '').toString().replace('%', '').trim();
        const parsed = parseFloat(raw);
        const normalized = Number.isFinite(parsed) ? parsed : defaultValue;
        const formattedNumber = this.decimalPipe.transform(normalized, '1.0-2') ?? `${defaultValue}`;
        control?.setValue(`${formattedNumber}%`, { emitEvent: false });
    }

    // Formats a numeric percentage value for display.
    formatPercentageValue(value: number | null | undefined, defaultValue: number = 25): string {
        const normalized = Number.isFinite(Number(value)) ? Number(value) : defaultValue;
        const formattedNumber = this.decimalPipe.transform(normalized, '1.0-2') ?? `${defaultValue}`;
        return `${formattedNumber}%`;
    }

    // Parses a percentage display/input value into a numeric percentage.
    parsePercentageValue(value: string | number | null | undefined, defaultValue: number = 25): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        const raw = (value ?? '').toString().replace('%', '').trim();
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    // English ordinal (1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, …). Truncates toward zero.
    ordinal(value: number): string {
        const n = Math.trunc(Number(value));
        if (!Number.isFinite(n)) {
            return '';
        }
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n);
        const j = abs % 10;
        const k = abs % 100;
        let suffix: string;
        if (j === 1 && k !== 11) {
            suffix = 'st';
        } else if (j === 2 && k !== 12) {
            suffix = 'nd';
        } else if (j === 3 && k !== 13) {
            suffix = 'rd';
        } else {
            suffix = 'th';
        }
        return `${sign}${abs}${suffix}`;
    }

    // Formats percentage on Enter and exits the field.
    formatPercentageOnEnter(event: KeyboardEvent, control: AbstractControl | null, defaultValue: number = 25): void {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        this.formatPercentageControl(control, defaultValue);
        (event.target as HTMLInputElement)?.blur();
    }

    // Formats percentage on blur.
    formatPercentageOnBlur(control: AbstractControl | null, defaultValue: number = 25): void {
        this.formatPercentageControl(control, defaultValue);
    }

    
    /*******************  Phone Numbers *******************/
    // Formats a phone number - supports US (10 digits) and international (up to 15 digits)
    // US format: (XXX) XXX-XXXX
    // International format: Returns exactly as stored (no auto-formatting)
    phoneNumber(phone?: string): string {
        if (!phone) return phone || '';
        const trimmed = phone.trim();

        // Keep non-US international values exactly as stored.
        if (trimmed.startsWith('+')) {
            const internationalDigits = trimmed.replace(/\D/g, '');
            if (!(internationalDigits.length === 11 && internationalDigits.startsWith('1'))) {
                return phone;
            }
        }

        // Normalize US country-code input (1XXXXXXXXXX) to local 10-digit formatting.
        let digits = trimmed.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
            digits = digits.substring(1);
        }

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

    /*******************  Credit Card *******************/
    // Removes all non-digit characters from a credit card number.
    stripCreditCardFormatting(cardNumber?: string | null): string {
        if (!cardNumber) return '';
        return cardNumber.replace(/\D/g, '');
    }

    // Formats credit card input in real-time with a space every 4 digits.
    formatCreditCardInput(event: Event, control: AbstractControl | null, maxDigits: number = 19): void {
        const input = event.target as HTMLInputElement;
        const digits = this.stripCreditCardFormatting(input.value).slice(0, maxDigits);
        const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();

        input.value = formatted;
        control?.setValue(formatted, { emitEvent: false });
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

    //#region Calendar date entry
    onCalendarDateMouseDown(event: MouseEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement | null;
        if (!input || input.disabled || input.readOnly) {
            return;
        }
        event.preventDefault();
        const state = this.calendarDateState(input, control);
        state.pointerDown = true;
        input.focus();
        queueMicrotask(() => {
            state.pointerDown = false;
            this.selectCalendarDateSegment(input, control, 'all');
        });
    }

    onCalendarDateMouseUp(event: MouseEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement | null;
        if (!input || input.disabled || input.readOnly || document.activeElement !== input) {
            return;
        }
        this.selectCalendarDateSegment(input, control, 'all');
    }

    onCalendarDateFocus(event: FocusEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement | null;
        if (!input || input.disabled || input.readOnly) {
            return;
        }
        const state = this.calendarDateState(input, control);
        state.valueAtFocus = this.calendarDateValueKey(control);
        if (state.pointerDown) {
            return;
        }
        queueMicrotask(() => {
            if (document.activeElement !== input) {
                return;
            }
            this.selectCalendarDateSegment(input, control, 'month');
        });
    }

    onCalendarDateBlur(event: FocusEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement | null;
        if (!input) {
            return;
        }
        const state = this.calendarDateEditStates.get(input);
        if (!state) {
            return;
        }
        if (state.empty) {
            this.commitCalendarDatePartial(state);
            if (state.month >= 1 && state.day >= 1 && state.year >= 1000) {
                state.empty = false;
                this.applyCalendarDate(input, control, state, true);
            } else {
                this.resetClearedCalendarDate(input, control, state);
            }
            this.notifyCalendarDateCommitted(input, control, state);
            return;
        }
        this.commitCalendarDatePartial(state);
        this.applyCalendarDate(input, control, state, true);
        this.notifyCalendarDateCommitted(input, control, state);
        setTimeout(() => this.paintCalendarDate(input, state));
    }

    onCalendarDatePaste(event: ClipboardEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement | null;
        if (!input || input.disabled || input.readOnly) {
            return;
        }
        const text = event.clipboardData?.getData('text')?.trim() ?? '';
        if (!text) {
            return;
        }
        event.preventDefault();
        const state = this.calendarDateState(input, control);
        this.syncCalendarDateFromControl(state, control, input);
        const pasted = this.parsePastedCalendarDate(text, state.year);
        if (!pasted) {
            return;
        }
        if (pasted.year < 1000) {
            return;
        }
        state.empty = false;
        state.month = pasted.month;
        state.day = pasted.day;
        state.year = pasted.year;
        state.monthDigits = '';
        state.dayDigits = '';
        state.yearDigits = '';
        this.clampCalendarDay(state);
        state.segment = 'all';
        this.applyCalendarDate(input, control, state, true);
    }

    onCalendarDateKeyDown(event: KeyboardEvent, control: AbstractControl | null): void {
        const input = event.target as HTMLInputElement | null;
        if (!input || input.disabled || input.readOnly) {
            return;
        }
        if (event.altKey) {
            return;
        }
        const state = this.calendarDateState(input, control);
        this.syncCalendarDateFromControl(state, control, input);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            this.selectCalendarDateSegment(input, control, 'all');
            return;
        }
        if (event.ctrlKey || event.metaKey) {
            return;
        }
        if (event.key === 'Tab') {
            this.onCalendarDateTab(event, input, control, state);
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.moveCalendarDateSegment(input, control, state, 1);
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.moveCalendarDateSegment(input, control, state, -1);
            return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            this.onCalendarDateBackspace(input, control, state);
            return;
        }
        if (event.key === '/') {
            event.preventDefault();
            this.onCalendarDateSlash(input, control, state);
            return;
        }
        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            this.onCalendarDateDigit(input, control, state, event.key);
        }
    }

    isCalendarDateBeforeOneYearAgo(value: unknown): boolean {
        const date = this.readCalendarDate(value);
        if (!date) {
            return false;
        }
        const today = new Date();
        const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        return date < cutoff;
    }

    async confirmIfCalendarDateBeforeOneYearAgo(dates: { label: string; value: unknown }[]): Promise<boolean> {
        const oldDates = dates
            .map(entry => ({ label: entry.label, date: this.readCalendarDate(entry.value) }))
            .filter((entry): entry is { label: string; date: Date } => !!entry.date && this.isCalendarDateBeforeOneYearAgo(entry.date));
        if (oldDates.length === 0) {
            return true;
        }
        const formatted = oldDates.map(entry => `${entry.label} ${this.dateOnly(entry.date)}`);
        const message = oldDates.length === 1
            ? `${formatted[0]} is more than a year ago. Is this date accurate?`
            : `These dates are more than a year ago: ${formatted.join(', ')}. Are these dates accurate?`;
        const { GenericModalComponent } = await import('../authenticated/shared/modals/generic/generic-modal.component');
        const dialogRef = this.dialog.open(GenericModalComponent, {
            width: '35rem',
            data: {
                title: 'Check Date',
                message,
                icon: 'warning',
                iconColor: 'accent',
                no: 'No',
                yes: 'Yes',
                callback: (ref: { close: (result: boolean) => void }, result: boolean) => ref.close(result),
                useHTML: false
            }
        });
        const result = await firstValueFrom(dialogRef.afterClosed());
        return result === true;
    }

    private onCalendarDateTab(event: KeyboardEvent, input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState): void {
        if (state.empty && state.segment === 'month' && !state.month && !state.monthDigits) {
            return;
        }
        if (event.shiftKey) {
            if (state.segment === 'day' || state.segment === 'year') {
                event.preventDefault();
                this.finishCalendarDateSegment(input, control, state);
                state.segment = state.segment === 'year' ? 'day' : 'month';
                this.clearCalendarDateBuffers(state);
                this.paintCalendarDate(input, state);
            }
            return;
        }
        if (state.segment === 'all' || state.segment === 'month' || state.segment === 'day') {
            event.preventDefault();
            const next: CalendarDateSegment = state.segment === 'month' ? 'day' : state.segment === 'day' ? 'year' : 'month';
            this.finishCalendarDateSegment(input, control, state);
            state.segment = next;
            this.clearCalendarDateBuffers(state);
            this.paintCalendarDate(input, state);
        }
    }

    private moveCalendarDateSegment(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState, direction: 1 | -1): void {
        const order: CalendarDateSegment[] = ['month', 'day', 'year'];
        const current = state.segment === 'all' ? 'month' : state.segment;
        const index = order.indexOf(current) + direction;
        if (index < 0 || index >= order.length) {
            return;
        }
        this.finishCalendarDateSegment(input, control, state);
        state.segment = order[index];
        this.clearCalendarDateBuffers(state);
        this.paintCalendarDate(input, state);
    }

    private onCalendarDateDigit(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState, digit: string): void {
        if (state.segment === 'all') {
            state.segment = 'month';
            state.monthDigits = '';
        }
        if (state.segment === 'month') {
            this.typeCalendarMonth(input, control, state, digit);
            return;
        }
        if (state.segment === 'day') {
            this.typeCalendarDay(input, control, state, digit);
            return;
        }
        this.typeCalendarYear(input, control, state, digit);
    }

    private typeCalendarMonth(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState, digit: string): void {
        if (state.monthDigits.length === 0 && digit >= '2') {
            state.month = Number(digit);
            state.monthDigits = '';
            this.clampCalendarDay(state);
            this.applyCalendarDate(input, control, state, true);
            state.segment = 'day';
            this.paintCalendarDate(input, state);
            return;
        }
        if (state.monthDigits.length === 0) {
            state.monthDigits = digit;
            this.paintCalendarDate(input, state);
            return;
        }
        const month = Number(state.monthDigits + digit);
        if (month < 1 || month > 12) {
            return;
        }
        state.month = month;
        state.monthDigits = '';
        this.clampCalendarDay(state);
        this.applyCalendarDate(input, control, state, true);
        state.segment = 'day';
        this.paintCalendarDate(input, state);
    }

    private typeCalendarDay(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState, digit: string): void {
        if (!state.month) {
            return;
        }
        const maxDay = this.daysInCalendarMonth(state.year, state.month);
        if (state.dayDigits.length === 0 && digit >= '4') {
            const day = Number(digit);
            if (day > maxDay) {
                return;
            }
            state.day = day;
            state.dayDigits = '';
            this.applyCalendarDate(input, control, state, true);
            state.segment = 'year';
            this.paintCalendarDate(input, state);
            return;
        }
        if (state.dayDigits.length === 0) {
            state.dayDigits = digit;
            this.paintCalendarDate(input, state);
            return;
        }
        const day = Number(state.dayDigits + digit);
        if (day < 1 || day > maxDay) {
            return;
        }
        state.day = day;
        state.dayDigits = '';
        this.applyCalendarDate(input, control, state, true);
        state.segment = 'year';
        this.paintCalendarDate(input, state);
    }

    private typeCalendarYear(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState, digit: string): void {
        if (!state.month || !state.day) {
            return;
        }
        if (state.yearDigits.length >= 4) {
            state.yearDigits = '';
        }
        state.yearDigits += digit;
        if (state.yearDigits.length < 4) {
            this.paintCalendarDate(input, state);
            return;
        }
        state.year = Number(state.yearDigits);
        state.yearDigits = '';
        state.empty = false;
        this.clampCalendarDay(state);
        this.applyCalendarDate(input, control, state, true);
    }

    private onCalendarDateSlash(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState): void {
        if (state.segment === 'all') {
            state.segment = 'month';
        }
        if (state.segment === 'month') {
            if (state.empty && !state.month && !state.monthDigits) {
                return;
            }
            this.finishCalendarDateSegment(input, control, state);
            state.segment = 'day';
            this.clearCalendarDateBuffers(state);
            this.paintCalendarDate(input, state);
            return;
        }
        if (state.segment === 'day') {
            if (state.dayDigits.length === 0) {
                this.paintCalendarDate(input, state);
                return;
            }
            this.finishCalendarDateSegment(input, control, state);
            state.segment = 'year';
            this.clearCalendarDateBuffers(state);
            this.paintCalendarDate(input, state);
        }
    }

    private onCalendarDateBackspace(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState): void {
        if (state.segment === 'all') {
            this.resetClearedCalendarDate(input, control, state);
            return;
        }
        if (state.segment === 'month') {
            state.monthDigits = '';
            this.paintCalendarDate(input, state);
            return;
        }
        if (state.segment === 'day') {
            if (state.dayDigits) {
                state.dayDigits = '';
                this.paintCalendarDate(input, state);
                return;
            }
            state.segment = 'month';
            this.paintCalendarDate(input, state);
            return;
        }
        if (state.yearDigits) {
            state.yearDigits = state.yearDigits.slice(0, -1);
            this.paintCalendarDate(input, state);
            return;
        }
        state.segment = 'day';
        this.paintCalendarDate(input, state);
    }

    private finishCalendarDateSegment(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState): void {
        this.commitCalendarDatePartial(state);
        if (state.empty) {
            this.paintCalendarDate(input, state);
            return;
        }
        this.applyCalendarDate(input, control, state, true);
    }

    private commitCalendarDatePartial(state: CalendarDateEditState): void {
        if (state.monthDigits.length === 1) {
            const month = Number(state.monthDigits);
            if (month >= 1 && month <= 12) {
                state.month = month;
            }
        }
        if (state.dayDigits.length === 1) {
            const day = Number(state.dayDigits);
            if (day >= 1 && day <= this.daysInCalendarMonth(state.year, state.month)) {
                state.day = day;
            }
        }
        if (state.yearDigits.length === 4) {
            state.year = Number(state.yearDigits);
        } else if (state.yearDigits.length === 2) {
            const year = Number(state.yearDigits);
            state.year = year >= 70 ? 1900 + year : 2000 + year;
        }
        this.clampCalendarDay(state);
        this.clearCalendarDateBuffers(state);
    }

    private selectCalendarDateSegment(input: HTMLInputElement, control: AbstractControl | null, segment: CalendarDateSegment): void {
        const state = this.calendarDateState(input, control);
        this.readCalendarDateIntoState(state, control, input);
        this.clearCalendarDateBuffers(state);
        state.segment = segment;
        this.paintCalendarDate(input, state);
    }

    private calendarDateState(input: HTMLInputElement, control: AbstractControl | null): CalendarDateEditState {
        const existing = this.calendarDateEditStates.get(input);
        if (existing) {
            return existing;
        }
        const created = this.createCalendarDateEditState(control, input);
        this.calendarDateEditStates.set(input, created);
        return created;
    }

    private createCalendarDateEditState(control: AbstractControl | null, input: HTMLInputElement): CalendarDateEditState {
        const state: CalendarDateEditState = {
            segment: 'all',
            month: 1,
            day: 1,
            year: new Date().getFullYear(),
            monthDigits: '',
            dayDigits: '',
            yearDigits: '',
            pointerDown: false,
            empty: false,
            valueAtFocus: ''
        };
        this.readCalendarDateIntoState(state, control, input);
        state.valueAtFocus = this.calendarDateValueKey(control);
        return state;
    }

    private calendarDateValueKey(control: AbstractControl | null): string {
        const date = this.readCalendarDate(control?.value);
        if (!date) {
            return '';
        }
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }

    private notifyCalendarDateCommitted(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState): void {
        const key = this.calendarDateValueKey(control);
        if (key === state.valueAtFocus) {
            return;
        }
        state.valueAtFocus = key;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    private syncCalendarDateFromControl(state: CalendarDateEditState, control: AbstractControl | null, input: HTMLInputElement): void {
        if (state.monthDigits || state.dayDigits || state.yearDigits) {
            return;
        }
        if (state.empty && !this.readCalendarDate(control?.value)) {
            return;
        }
        this.readCalendarDateIntoState(state, control, input);
    }

    private readCalendarDateIntoState(state: CalendarDateEditState, control: AbstractControl | null, input: HTMLInputElement): void {
        const date = this.readCalendarDate(control?.value) ?? this.readCalendarDate(input.value);
        if (!date) {
            state.empty = true;
            state.month = 0;
            state.day = 0;
            state.year = 0;
            return;
        }
        state.empty = false;
        state.month = date.getMonth() + 1;
        state.day = date.getDate();
        state.year = date.getFullYear();
    }

    private resetClearedCalendarDate(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState): void {
        state.empty = true;
        state.segment = 'month';
        state.month = 0;
        state.day = 0;
        state.year = 0;
        this.clearCalendarDateBuffers(state);
        if (control && control.value != null && control.value !== '') {
            control.setValue(null, { emitEvent: true });
        }
        input.value = '';
    }

    private readCalendarDate(value: unknown): Date | null {
        if (value instanceof Date && !isNaN(value.getTime())) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        if (typeof value !== 'string') {
            return null;
        }
        const iso = this.parseCalendarPrefixToLocalDate(value);
        if (iso) {
            return iso;
        }
        const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
        if (!us) {
            return null;
        }
        const month = Number(us[1]);
        const day = Number(us[2]);
        const year = Number(us[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        return new Date(year, month - 1, day);
    }

    private parsePastedCalendarDate(text: string, currentYear: number): { month: number; day: number; year: number } | null {
        const full = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
        const shortYear = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(text);
        const monthDay = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        let month = 0;
        let day = 0;
        let year = currentYear;
        if (full) {
            month = Number(full[1]);
            day = Number(full[2]);
            year = Number(full[3]);
        } else if (shortYear) {
            month = Number(shortYear[1]);
            day = Number(shortYear[2]);
            const yy = Number(shortYear[3]);
            year = yy >= 70 ? 1900 + yy : 2000 + yy;
        } else if (monthDay) {
            month = Number(monthDay[1]);
            day = Number(monthDay[2]);
        } else if (iso) {
            year = Number(iso[1]);
            month = Number(iso[2]);
            day = Number(iso[3]);
        } else {
            return null;
        }
        if (month < 1 || month > 12 || day < 1 || day > this.daysInCalendarMonth(year, month)) {
            return null;
        }
        return { month, day, year };
    }

    private applyCalendarDate(input: HTMLInputElement, control: AbstractControl | null, state: CalendarDateEditState, emitIfChanged: boolean): void {
        if (state.empty || state.month < 1 || state.day < 1 || state.year < 1000) {
            this.paintCalendarDate(input, state);
            return;
        }
        const date = new Date(state.year, state.month - 1, state.day);
        date.setHours(0, 0, 0, 0);
        const current = this.readCalendarDate(control?.value);
        const same = !!current
            && current.getFullYear() === date.getFullYear()
            && current.getMonth() === date.getMonth()
            && current.getDate() === date.getDate();
        if (control) {
            if (!same) {
                control.setValue(date, { emitEvent: emitIfChanged });
            }
        } else {
            input.value = this.formatCalendarEditText(state);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.paintCalendarDate(input, state);
    }

    private paintCalendarDate(input: HTMLInputElement, state: CalendarDateEditState): void {
        input.value = this.formatCalendarEditText(state);
        const text = input.value;
        if (!text) {
            return;
        }
        if (state.segment === 'all') {
            input.setSelectionRange(0, text.length);
            return;
        }
        const first = text.indexOf('/');
        if (first < 0) {
            input.setSelectionRange(0, text.length);
            return;
        }
        const second = text.indexOf('/', first + 1);
        if (state.segment === 'month') {
            input.setSelectionRange(0, first);
            return;
        }
        if (state.segment === 'day' || second < 0) {
            input.setSelectionRange(first + 1, second < 0 ? text.length : second);
            return;
        }
        input.setSelectionRange(second + 1, text.length);
    }

    private formatCalendarEditText(state: CalendarDateEditState): string {
        if (state.empty) {
            const monthText = state.monthDigits.length === 1
                ? state.monthDigits
                : state.month ? String(state.month).padStart(2, '0') : '';
            if (!monthText) {
                return '';
            }
            if (state.segment === 'month') {
                return monthText;
            }
            const dayText = state.dayDigits.length === 1
                ? state.dayDigits
                : state.day ? String(state.day).padStart(2, '0') : '';
            if (state.segment === 'day') {
                return dayText ? `${monthText}/${dayText}` : `${monthText}/`;
            }
            const yearText = state.yearDigits;
            const committedDay = dayText || (state.day ? String(state.day).padStart(2, '0') : '');
            return `${monthText}/${committedDay}/${yearText}`;
        }
        const monthText = state.segment === 'month' && state.monthDigits.length === 1
            ? state.monthDigits
            : String(state.month).padStart(2, '0');
        const dayText = state.segment === 'day' && state.dayDigits.length === 1
            ? state.dayDigits
            : String(state.day).padStart(2, '0');
        const yearText = state.segment === 'year' && state.yearDigits.length > 0
            ? state.yearDigits
            : String(state.year);
        return `${monthText}/${dayText}/${yearText}`;
    }

    private clearCalendarDateBuffers(state: CalendarDateEditState): void {
        state.monthDigits = '';
        state.dayDigits = '';
        state.yearDigits = '';
    }

    private clampCalendarDay(state: CalendarDateEditState): void {
        const maxDay = this.daysInCalendarMonth(state.year, state.month);
        if (state.day > maxDay) {
            state.day = maxDay;
        }
    }

    private daysInCalendarMonth(year: number, month: number): number {
        const safeYear = year >= 1000 ? year : 2024;
        return new Date(safeYear, month, 0).getDate();
    }
    //#endregion
}