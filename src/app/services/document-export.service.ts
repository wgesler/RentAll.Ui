import { Injectable } from '@angular/core';

export interface EmailOptions {
  recipientEmail: string;
  subject: string;
  organizationName?: string;
  tenantName?: string;
  htmlContent: string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentExportService {


  /**
   * Prints HTML content
   * @param htmlContent The HTML content to print
   * @returns void
   */
  printHTML(htmlContent: string): void {
    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Document</title>
            <style>
              @media print {
                @page {
                  margin-top: 70px;
                  margin-bottom: 70px;
                  margin-left: 70px;
                  margin-right: 70px;
                }
                body { 
                  margin: 0; 
                  padding: 0;
                  padding-top: 40px;
                  font-family: Arial, Helvetica, sans-serif;
                }
              }
              @media screen {
                body {
                  margin: 0;
                  padding: 20px;
                }
              }
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>
      `);
      iframeDoc.close();

      let hasPrinted = false;
      const printAndCleanup = () => {
        if (hasPrinted) return;
        hasPrinted = true;
        
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            // Remove iframe after printing
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 100);
          }
        }, 250);
      };

      // Wait for content to load, then print
      iframe.onload = printAndCleanup;

      // Fallback if onload doesn't fire
      setTimeout(printAndCleanup, 500);
    }
  }

  /**
   * Opens email client with pre-filled content
   * @param options Email options including recipient, subject, and HTML content
   * @returns Promise<void>
   */
  async emailWithPDF(options: EmailOptions): Promise<void> {
    try {
      // Create email body with salutation and signature
      const tenantName = options.tenantName || '[Guest Name]';
      const companyName = options.organizationName || '[Your Name / Your Team]';
      
      const plainTextBody = `Dear ${tenantName},\n\nWe are excited to welcome you soon! Should you have any questions or need further assistance, your booking agent will be happy to help.\n\nWe look forward to your visit!\n\nBest regards,\n${companyName}\n\n**PASTE WELCOME LETTER CONTENTS HERE**`;

      // Open email client
      const subject = encodeURIComponent(options.subject);
      const body = encodeURIComponent(plainTextBody);
      const mailtoLink = `mailto:${options.recipientEmail}?subject=${subject}&body=${body}`;
      window.location.href = mailtoLink;

    } catch (error) {
      console.error('Error opening email client:', error);
      throw error;
    }
  }
}

