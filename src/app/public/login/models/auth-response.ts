import { ErrorResponse } from "../../../shared/models/error-response";

export class AuthResponse extends ErrorResponse {
    AccessToken?:  string;
    ExpiresIn?:    number;
    TokenType?:    string;
    RefreshToken?: string;
    Scope?:         string;
}