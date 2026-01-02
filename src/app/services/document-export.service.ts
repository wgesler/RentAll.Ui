import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
   * Generates a PDF blob from HTML content
   * @param htmlContent The HTML content to convert to PDF
   * @param element Optional DOM element to capture (if not provided, will create iframe like print)
   * @returns Promise<Blob> The PDF as a blob
   */
  async generatePDFBlob(htmlContent: string, element?: HTMLElement): Promise<Blob> {
    let targetElement: HTMLElement;
    let isIframe = false;
    let iframe: HTMLIFrameElement | null = null;

    if (element) {
      targetElement = element;
    } else {
      // Create an iframe like print does for consistency
      isIframe = true;
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '8.5in'; // Match the lease template width
      iframe.style.height = '10000px';
      iframe.style.border = '0';
      iframe.style.overflow = 'visible';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        // Check if htmlContent is a complete HTML document (starts with <!DOCTYPE or <html>)
        const isFullDocument = /^\s*<!DOCTYPE/i.test(htmlContent) || /^\s*<html/i.test(htmlContent);
        
        if (isFullDocument) {
          // For full HTML documents (like lease templates), write directly to iframe
          // This preserves the complete structure including all three documents
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
        } else {
          // For partial HTML (just body content), wrap it with styles
          // Extract ALL styles from HTML content - there may be multiple style blocks
          let extractedStyles = '';
          const styleMatches = htmlContent.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
          for (const match of styleMatches) {
            if (match[1]) {
              extractedStyles += match[1] + '\n';
            }
          }
          
          // Remove all style tags from body but keep everything else
          const htmlWithoutStyles = htmlContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
          
          iframeDoc.open();
          iframeDoc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Document</title>
                <style>
                  * {
                    box-sizing: border-box;
                  }
                  html, body {
                    margin: 0; 
                    padding: 0;
                    width: 100%;
                  }
                  ${extractedStyles || `
                  body {
                    font-family: Arial, Helvetica, sans-serif;
                    line-height: 1.6;
                    color: #000;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 10px;
                  }
                  `}
                </style>
              </head>
              <body>
                ${htmlWithoutStyles}
              </body>
            </html>
          `);
          iframeDoc.close();
        }
        
        targetElement = iframeDoc.body;
        
        // Wait for iframe to load
        await new Promise(resolve => {
          if (iframe.contentWindow) {
            iframe.onload = resolve;
            iframe.contentWindow.onload = resolve;
          }
          setTimeout(resolve, 1000);
        });
        
        // Wait for content to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Force a reflow to ensure accurate height calculation
        if (iframeDoc.body) {
          const images = iframeDoc.body.getElementsByTagName('img');
          const imagePromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 2000); // Timeout after 2 seconds
            });
          });
          await Promise.all(imagePromises);
          
          // Force layout recalculation multiple times
          iframeDoc.body.style.display = 'none';
          void iframeDoc.body.offsetHeight; // Force reflow
          iframeDoc.body.style.display = '';
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Calculate actual content height - check all possible sources
          const bodyScroll = iframeDoc.body.scrollHeight;
          const bodyOffset = iframeDoc.body.offsetHeight;
          const docScroll = iframeDoc.documentElement.scrollHeight;
          const docOffset = iframeDoc.documentElement.offsetHeight;
          const contentHeight = Math.max(bodyScroll, bodyOffset, docScroll, docOffset, 5000);
          
          // Set iframe height to accommodate all content - make it very large
          const finalHeight = Math.max(contentHeight + 1000, 15000);
          iframe.style.height = finalHeight + 'px';
          
          // Force another reflow after height change
          void iframeDoc.body.offsetHeight;
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Re-check height after iframe expansion
          const finalBodyHeight = Math.max(
            iframeDoc.body.scrollHeight,
            iframeDoc.body.offsetHeight,
            iframeDoc.documentElement.scrollHeight,
            iframeDoc.documentElement.offsetHeight
          );
          if (finalBodyHeight > contentHeight) {
            iframe.style.height = (finalBodyHeight + 1000) + 'px';
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      } else {
        throw new Error('Could not create iframe for PDF generation');
      }
    }

    try {
      // Wait for content to render (longer wait for iframe)
      await new Promise(resolve => setTimeout(resolve, isIframe ? 1000 : 300));

      // Get accurate dimensions - force recalculation
      const elementWidth = Math.max(targetElement.scrollWidth, targetElement.offsetWidth, 800);
      // Force a reflow to ensure accurate measurements
      void targetElement.offsetHeight;
      
      // Get the actual scroll height - don't limit it
      let elementHeight = 0;
      if (isIframe && targetElement.ownerDocument) {
        const doc = targetElement.ownerDocument;
        elementHeight = Math.max(
          targetElement.scrollHeight,
          targetElement.offsetHeight,
          doc.documentElement.scrollHeight,
          doc.documentElement.offsetHeight,
          doc.body.scrollHeight,
          doc.body.offsetHeight
        );
      } else {
        elementHeight = Math.max(
          targetElement.scrollHeight,
          targetElement.offsetHeight,
          targetElement.clientHeight
        );
      }

      // Don't limit html2canvas height - let it capture everything
      // Convert HTML element to canvas
      const canvas = await html2canvas(targetElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: elementWidth,
        height: elementHeight,
        windowWidth: elementWidth,
        windowHeight: elementHeight,
        allowTaint: false,
        removeContainer: false,
        scrollX: 0,
        scrollY: 0
      });
      
      // Log canvas dimensions for debugging
      console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
      console.log('Element height:', elementHeight);

      // Calculate PDF dimensions (Letter size to match print)
      // Letter size: 8.5in x 11in = 215.9mm x 279.4mm
      // Margins: 0.75in = 19.05mm (all sides) - matching print settings
      const pdfWidth = 215.9; // Letter width in mm (8.5in)
      const pdfHeight = 279.4; // Letter height in mm (11in)
      const marginTop = 19.05; // 0.75in in mm
      const marginRight = 19.05; // 0.75in in mm
      const marginBottom = 19.05; // 0.75in in mm
      const marginLeft = 19.05; // 0.75in in mm
      const contentWidth = pdfWidth - (marginLeft + marginRight); // Content width
      const contentHeight = pdfHeight - (marginTop + marginBottom); // Content height per page
      
      // Calculate image dimensions - use actual element size, not forced to contentWidth
      // The canvas was captured at 2x scale, so canvas.width = 2 * elementWidth (in pixels)
      // Convert element dimensions from pixels to mm: 1in = 96px at 96 DPI, so 1px = 25.4/96 = 0.264583mm
      // The iframe is 8.5in = 816px = 215.9mm
      const pixelsToMm = 0.264583; // 1px = 0.264583mm at 96 DPI
      const html2canvasScale = 2; // html2canvas scale factor
      
      // Convert actual element dimensions to mm (divide canvas by scale to get element size)
      const actualElementWidthPx = canvas.width / html2canvasScale;
      const actualElementHeightPx = canvas.height / html2canvasScale;
      
      // Convert to mm - this is the actual rendered size
      const imgWidth = actualElementWidthPx * pixelsToMm; // Should be ~215.9mm (8.5in)
      const imgHeight = actualElementHeightPx * pixelsToMm;
      
      // Now we need to scale to fit within margins if needed, but preserve aspect ratio
      // Calculate available width after margins
      const availableWidth = pdfWidth - (marginLeft + marginRight);
      
      // Only scale down if content is wider than available space
      let finalImgWidth = imgWidth;
      let finalImgHeight = imgHeight;
      if (imgWidth > availableWidth) {
        const scaleFactor = availableWidth / imgWidth;
        finalImgWidth = availableWidth;
        finalImgHeight = imgHeight * scaleFactor;
      }
      
      // Use final dimensions
      const imgWidthFinal = finalImgWidth;
      const imgHeightFinal = finalImgHeight;
      
      // Create PDF with letter size to match print
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [215.9, 279.4] // Letter size: 8.5in x 11in
      });
      const totalHeight = imgHeightFinal;
      let yPosition = marginTop;
      let sourceY = 0;

      // Split the image across multiple pages if needed
      while (sourceY < totalHeight) {
        // Calculate how much of the image fits on current page
        const remainingHeight = totalHeight - sourceY;
        const pageHeight = contentHeight;
        const heightToAdd = Math.min(remainingHeight, pageHeight);
        
        // Calculate the source crop for this page
        const sourceHeight = (heightToAdd / imgHeightFinal) * canvas.height;
        
        // Create a temporary canvas for this page's portion
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        
        if (pageCtx) {
          // Draw the portion of the image for this page
          pageCtx.drawImage(
            canvas,
            0, sourceY, canvas.width, sourceHeight, // source
            0, 0, canvas.width, sourceHeight // destination
          );
        }
        
        // Calculate the display height for this page portion
        const displayHeight = heightToAdd;
        
        // Add image to PDF with proper margins
        // Center horizontally if content is narrower than available width
        const xPosition = marginLeft + (availableWidth - imgWidthFinal) / 2;
        pdf.addImage(
          pageCanvas.toDataURL('image/png'),
          'PNG',
          xPosition,
          yPosition,
          imgWidthFinal,
          displayHeight
        );
        
        sourceY += sourceHeight;
        
        // If there's more content, add a new page
        if (sourceY < totalHeight) {
          pdf.addPage();
          yPosition = marginTop;
        }
      }

      // Clean up iframe if we created it
      if (isIframe && iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }

      return pdf.output('blob');
    } catch (error) {
      // Clean up iframe on error
      if (isIframe && iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      throw error;
    }
  }

  /**
   * Downloads a PDF file
   * @param htmlContent The HTML content to convert to PDF
   * @param fileName The name of the file to download
   * @param element Optional DOM element to capture
   * @returns Promise<void>
   */
  async downloadPDF(htmlContent: string, fileName: string, element?: HTMLElement): Promise<void> {
    try {
      const pdfBlob = await this.generatePDFBlob(htmlContent, element);
      
      // Create download link
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      throw error;
    }
  }

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
   * Opens email client with PDF attachment
   * @param options Email options including recipient, subject, and HTML content
   * @returns Promise<void>
   */
  async emailWithPDF(options: EmailOptions): Promise<void> {
    try {
      // Generate and download PDF first
      const pdfBlob = await this.generatePDFBlob(options.htmlContent);
      const fileNameCompanyName = (options.organizationName || 'Document').replace(/[^a-z0-9]/gi, '_');
      const fileName = `${fileNameCompanyName}_${new Date().toISOString().split('T')[0]}.pdf`;

      // Download the PDF
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);

      // Create email body
      const tenantName = options.tenantName || '[Guest Name]';
      const companyName = options.organizationName || '[Your Name / Your Team]';
      const emailBody = `Dear ${tenantName},\n\nWe are excited to welcome you soon! Please find attached all the relevant information regarding your stay. Should you have any questions or need further assistance, your booking agent will be happy to help.\n\nWe look forward to your visit!\n\nBest regards,\n${companyName}`;

      // Open email client
      const subject = encodeURIComponent(options.subject);
      const body = encodeURIComponent(emailBody);
      const mailtoLink = `mailto:${options.recipientEmail}?subject=${subject}&body=${body}`;
      window.location.href = mailtoLink;

    } catch (error) {
      console.error('Error generating PDF for email:', error);
      throw error;
    }
  }
}

