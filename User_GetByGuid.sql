CREATE PROCEDURE [dbo].[User_GetByGuid]
    @UserId UNIQUEIDENTIFIER
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
    WHERE 
        UserId = @UserId;
END



