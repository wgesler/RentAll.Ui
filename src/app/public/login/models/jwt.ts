import { JwtTempUser } from './jwt-temp';

export class JwtContainer {
    sub: string;
    exp: number;
    user: JwtUser;

    constructor(sub: string, exp: number, user: any) {
        this.sub = sub;
        this.exp = exp;
        // API returns PascalCase, so we need to access properties with PascalCase
        this.user = new JwtUser(
            user.UserGuid || user.userGuid || '',
            user.FirstName || user.firstName || '',
            user.LastName || user.lastName || '',
            user.Email || user.email || '',
            user.UserGroups || user.userGroups || []
        );
    }
}

export class JwtUser {
    userGuid: string;
    firstName: string;
    lastName: string;
    email: string;
    userGroups: string[];


    constructor(
        userGuid: string,
        firstName: string,
        lastName: string,
        email: string,
        userGroups: string[]
    ) {
        this.userGuid = userGuid;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.userGroups = userGroups;
    }
}