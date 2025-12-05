export class LoginRequest {
    public username: string = '';
    public password: string = ';'
}

export class VerificationRequest {
    verificationToken: string = '';
}

export class ResendCodeRequest {
    emailAddress: string = '';
}