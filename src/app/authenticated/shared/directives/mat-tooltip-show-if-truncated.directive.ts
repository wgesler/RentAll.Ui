import { AfterViewInit, Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { Observable, Subscription, fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Directive({
	selector: '[matTooltip][appMatTooltipShowIfTruncated]'
})
export class MatToolTipShowIfTruncatedDirective implements OnInit, AfterViewInit, OnDestroy {
	private matTooltip = inject(MatTooltip);
	private el = inject(ElementRef<HTMLElement>);

	resizeObservable$: Observable<Event> | undefined;
	resizeSubscription: Subscription | undefined;

	ngOnInit(): void {
		this.resizeObservable$ = fromEvent(window, 'resize');
		this.resizeSubscription = this.resizeObservable$
			.pipe(debounceTime(300))
			.subscribe(() => {
				this.updateToolTip();
			});
	}

	ngAfterViewInit(): void {
		this.updateToolTip();
	}

	ngOnDestroy(): void {
		if (this.resizeSubscription) {
			this.resizeSubscription.unsubscribe();
		}
	}

	updateToolTip(): void {
		setTimeout(() => {
			const element = this.el.nativeElement;
			this.matTooltip.disabled = element.scrollWidth <= element.clientWidth;
		});
	}
}
