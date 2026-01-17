CREATE PROCEDURE [dbo].[User_Create]
    @UserId UNIQUEIDENTIFIER,
    @OrganizationId UNIQUEIDENTIFIER,
    @FirstName NVARCHAR(100),
    @LastName NVARCHAR(100),
    @Email NVARCHAR(255),
    @Password NVARCHAR(255),
    @UserGroups NVARCHAR(MAX),
    @OfficeAccess NVARCHAR(MAX) = NULL,
    @IsActive BIT,
    @CreatedBy NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [User] (
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
    )
    VALUES (
        @UserId,
        @OrganizationId,
        @FirstName,
        @LastName,
        @Email,
        @Password,
        @UserGroups,
        @OfficeAccess,
        @IsActive,
        GETUTCDATE(),
        @CreatedBy,
        GETUTCDATE(),
        @CreatedBy
    );

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



