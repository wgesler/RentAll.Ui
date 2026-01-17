CREATE PROCEDURE [dbo].[User_GetAll]
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        UserId,
        OrganizationId,
        FirstName,
        LastName,
        Email,
        Password,
        UserGroups,
        OfficeAccess,
        IsActive,
        CreatedOn,
        CreatedBy,
        ModifiedOn,
        ModifiedBy
    FROM 
        [User]
    ORDER BY 
        LastName, FirstName;
END



