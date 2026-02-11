import { LoginDetails } from '../../public/login/models/auth';
import { PurposefulAny } from './amorphous';

export class SessionData {
    name: string = '';
    value: LoginDetails | string[] | PurposefulAny;
}
