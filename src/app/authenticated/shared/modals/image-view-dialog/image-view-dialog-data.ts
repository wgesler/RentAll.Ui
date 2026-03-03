export interface ImageViewDialogData {
  /** Data URL or URL of the image to display (e.g. data:image/png;base64,... or https://...) */
  imageSrc: string;
  /** Optional title shown in the dialog header */
  title?: string;
}
