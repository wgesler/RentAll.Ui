export class ErrorResponse {
    error: string = '';
    error_description: string = '';
}

export class ErrorResponseDto {
    controller: string = '';
    httpMethod: string = '';
    actionName: string = '';
    route: string = '';
    message: string = '';
}