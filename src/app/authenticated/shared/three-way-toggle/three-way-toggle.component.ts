import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type ThreeWayToggleValue = 0 | 1 | 2;
export type ThreeWayToggleLabels = readonly [string, string, string];

@Component({
  standalone: true,
  selector: 'app-three-way-toggle',
  imports: [CommonModule],
  templateUrl: './three-way-toggle.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThreeWayToggleComponent {
  @Input({ required: true }) labels!: ThreeWayToggleLabels;
  @Input() value: ThreeWayToggleValue = 0;
  @Input() ariaLabel?: string;
  @Output() valueChange = new EventEmitter<ThreeWayToggleValue>();

  get label(): string {
    return this.labels[this.value] ?? this.labels[0];
  }

  get resolvedAriaLabel(): string {
    return this.ariaLabel ?? `${this.label} filter`;
  }

  onTrackClick(event: MouseEvent): void {
    const track = (event.currentTarget as HTMLElement).querySelector('.three-way-toggle__track');
    if (!(track instanceof HTMLElement)) {
      return;
    }

    this.setValue(this.resolveIndexFromTrackClick(track, event.clientX));
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.setValue(Math.max(0, this.value - 1) as ThreeWayToggleValue);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.setValue(Math.min(2, this.value + 1) as ThreeWayToggleValue);
    }
  }

  resolveIndexFromTrackClick(track: HTMLElement, clientX: number): ThreeWayToggleValue {
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const third = rect.width / 3;
    if (x >= third * 2) {
      return 2;
    }
    if (x >= third) {
      return 1;
    }
    return 0;
  }

  private setValue(index: ThreeWayToggleValue): void {
    if (index === this.value) {
      return;
    }
    this.valueChange.emit(index);
  }
}
