import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'safe_html', standalone: true })
export class SafeHTMLPipe implements PipeTransform {
    constructor(private sanitizer: DomSanitizer) { }
    transform(html: string): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(html);
    }
}
