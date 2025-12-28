import { PurposefulAny } from './amorphous';
import { LoginDetails } from '../../public/login/models/auth';

export class SessionData {
    name: string = '';
    value: LoginDetails | string[] | PurposefulAny;
}
