import { ErrorResponse } from "../../../shared/models/error-response";

export class AuthResponse extends ErrorResponse {
    accessToken?:  string;
    expiresIn?:    number;
    tokenType?:    string;
    refreshToken?: string;
    scope?:         string;
}