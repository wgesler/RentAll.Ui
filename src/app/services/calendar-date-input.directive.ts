import { AfterViewInit, Directive, ElementRef, HostListener, Injector, OnDestroy, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { FormatterService } from './formatter-service';

@Directive({
  selector: 'input[matDatepicker]',
  standalone: true
})
export class CalendarDateInputDirective implements AfterViewInit, OnDestroy {
  private formatter = inject(FormatterService);
  private injector = inject(Injector);
  private input = inject(ElementRef<HTMLInputElement>);
  private onBlur = (event: FocusEvent) => {
    this.formatter.onCalendarDateBlur(event, this.control);
  };

  constructor() {
    this.input.nativeElement.addEventListener('blur', this.onBlur, true);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.removeCalendarButtonFromTabOrder());
  }

  ngOnDestroy(): void {
    this.input.nativeElement.removeEventListener('blur', this.onBlur, true);
  }

  removeCalendarButtonFromTabOrder(): void {
    const input = this.input.nativeElement;
    const field = input.closest('mat-form-field, .mat-mdc-form-field') ?? input.parentElement;
    field?.querySelectorAll('button, mat-datepicker-toggle').forEach(element => {
      const iconName = (element.querySelector('mat-icon')?.textContent || '').trim();
      const label = (element.getAttribute('aria-label') || '').toLowerCase();
      const isCalendarButton = element.tagName === 'MAT-DATEPICKER-TOGGLE'
        || element.classList.contains('mat-datepicker-toggle')
        || iconName === 'calendar_today'
        || label.includes('calendar')
        || !!element.querySelector('.mat-datepicker-toggle-default-icon');
      if (!isCalendarButton) {
        return;
      }
      if (element instanceof HTMLButtonElement) {
        element.tabIndex = -1;
      }
      element.querySelectorAll('button').forEach(button => {
        button.tabIndex = -1;
      });
    });
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    this.formatter.onCalendarDateMouseDown(event, this.control);
  }

  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    this.formatter.onCalendarDateMouseUp(event, this.control);
  }

  @HostListener('focus', ['$event'])
  onFocus(event: FocusEvent): void {
    this.formatter.onCalendarDateFocus(event, this.control);
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    this.formatter.onCalendarDateKeyDown(event, this.control);
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    this.formatter.onCalendarDatePaste(event, this.control);
  }

  private get control() {
    return this.injector.get(NgControl, null, { self: true, optional: true })?.control ?? null;
  }
}
