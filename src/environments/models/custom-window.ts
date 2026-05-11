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
    publicListingUiOrigin?: string;
}