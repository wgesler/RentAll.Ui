export class JwtTempContainer {
	sub: string = '';
    exp: number = 0;
	user: string = '';
}

export class JwtTempUser {
    userGuid: string = '';
    firstName: string = '';
    lastName: string = '';
    email: string = '';
    role: string = '';
}