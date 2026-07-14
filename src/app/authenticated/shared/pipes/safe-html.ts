import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'safe_html', standalone: true })
export class SafeHTMLPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);

    transform(html: string): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(html);
    }
}
