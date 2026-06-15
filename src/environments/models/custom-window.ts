export interface CustomWindow extends Window {
    env: Environment;
}

export interface Environment {
    production: boolean;
    staging: boolean;
    dev: boolean;
    local: boolean;
    title: string;
    apiUrl: string;
    /** When set, public listing share/copy/PDF links use this UI origin (https://your-app...) instead of window.location — required for emailed PDFs to external users. */
    propertyListingUiOrigin?: string;
    /** Leave empty for normal quotes. Set full listing URL only for PDF/href isolation tests; never in prod. */
    propertyListingHrefDiagnostic?: string;
    /** Local/dev: true logs listing URLs to console after links resolve (compare with PDF href). */
    propertyListingHrefLogDebug?: boolean;
}