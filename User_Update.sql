CREATE PROCEDURE [dbo].[User_Update]
    @UserId UNIQUEIDENTIFIER,
    @OrganizationId UNIQUEIDENTIFIER,
    @FirstName NVARCHAR(100),
    @LastName NVARCHAR(100),
    @Email NVARCHAR(255),
    @Password NVARCHAR(255),
    @UserGroups NVARCHAR(MAX),
    @OfficeAccess NVARCHAR(MAX) = NULL,
    @IsActive BIT,
    @ModifiedBy NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [User]
    SET 
        OrganizationId = @OrganizationId,
        FirstName = @FirstName,
        LastName = @LastName,
        Email = @Email,
        Password = @Password,
        UserGroups = @UserGroups,
        OfficeAccess = @OfficeAccess,
        IsActive = @IsActive,
        ModifiedOn = GETUTCDATE(),
        ModifiedBy = @ModifiedBy
    WHERE 
        UserId = @UserId;

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

