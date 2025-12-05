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
}