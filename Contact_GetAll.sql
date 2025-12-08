CREATE PROCEDURE [dbo].[Contact_GetAll]
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        ContactId,
        ContactCode,
        FirstName,
        LastName,
        Address1,
        Address2,
        City,
        State,
        Zip,
        Phone,
        Email,
        IsActive
    FROM 
        Contact
    ORDER BY 
        LastName, FirstName;
END

