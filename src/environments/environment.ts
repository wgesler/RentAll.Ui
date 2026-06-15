export const environment = {
	production: false,
	staging: false,
	dev: false,
	local: true,
	title: 'RentAll - Local',
	apiUrl: 'https://localhost:7154/api/',
	/** Leave empty for normal quotes. Set full listing URL only for PDF/href isolation tests; never in prod. */
	propertyListingHrefDiagnostic: '',
	/** Local/dev: true logs listing URLs to console after links resolve (compare with PDF href). */
	propertyListingHrefLogDebug: false,
	/** Empty = use current browser origin for listing links. Set deployed UI base (https://...) so PDFs/emails use public URLs; localhost mail recipients cannot open localhost links. */
	propertyListingUiOrigin: '',
};
