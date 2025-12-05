import { JwtTempUser } from './jwt-temp';

export class JwtContainer {
    sub: string;
    exp: number;
    user: JwtUser;

    constructor(sub: string, exp: number, user: JwtTempUser) {
        this.sub = sub;
        this.exp = exp;
        this.user = new JwtUser(
            user.userGuid,
            user.firstName,
            user.lastName,
            user.email,
            user.role
        );
    }
}

export class JwtUser {
    userGuid: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;


    constructor(
        userGuid: string,
        firstName: string,
        lastName: string,
        email: string,
        role: string,
    ) {
        this.userGuid = userGuid;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.role = role;
    }
}