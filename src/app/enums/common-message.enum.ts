export enum CommonMessage {
	Error = 'Error...',
	Success = 'Success...',
	ServiceError = 'Service Error...',
	TryAgain = ' Please try again later, or contact your administrator.',
	Unauthorized = 'Unauthorized...',
	Unexpected = 'An unexpected error has occurred.'
  }
  
  export enum CommonTimeouts {
	Success = 3000,
	Error = 5000, // Set as default
	Extended = 10000,
	NeedsUserAcknowledgement = 0
  }
  
  export const emptyGuid = '00000000-0000-0000-0000-000000000000';
  
  