export type ColumnSet = { [name: string]: ColumnData };

export interface ColumnData {
    name?: string;
    displayAs?: string;
    wrap?: boolean;
    sort?: boolean;
    maxWidth?: string;
    alignment?: string;

    obfuscate?: boolean;
    isCheckbox?: boolean;
    options?: string[];
    buttonText?: string;
}

export const defaultColumnData: ColumnData = {
    wrap: true,
    sort: true,
    maxWidth: 'auto',
    alignment: 'left',

    obfuscate: false,
    isCheckbox: false,
    options: undefined,
    buttonText: undefined,
};
