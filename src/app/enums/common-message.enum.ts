export enum CommonMessage {
	Error = 'Error...',
	Success = 'Success...',
	ServiceError = 'Service Error...',
	Unauthorized = 'Unauthorized...',
	TryAgain = ' Please try again later, or contact your administrator.',
	Unexpected = 'An unexpected error has occurred.',
	SessionTimeout = 'Your session has expired. Please log in again.',
	UnauthorizedAction = 'You are not authorized to perform this action.'
  }
  
  export enum CommonTimeouts {
	Success = 3000,
	Error = 5000, // Set as default
	Extended = 10000,
	NeedsUserAcknowledgement = 0
  }
  
  export const emptyGuid = '00000000-0000-0000-0000-000000000000';
  
  