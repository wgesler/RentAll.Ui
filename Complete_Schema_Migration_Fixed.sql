-- ========================================
-- Complete Schema Migration - Fixed Version
-- ========================================
-- This script fixes:
-- 1. Data migration order (parents before children)
-- 2. IDENTITY_INSERT for identity columns
-- ========================================

PRINT '========================================';
PRINT 'Starting Complete Schema Migration';
PRINT '========================================';
PRINT '';

-- ========================================
-- Step 1: Creating schemas...
-- ========================================
PRINT 'Step 1: Creating schemas...';

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'Organization')
BEGIN
    EXEC('CREATE SCHEMA Organization');
    PRINT '  Created schema: Organization';
END

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'Property')
BEGIN
    EXEC('CREATE SCHEMA Property');
    PRINT '  Created schema: Property';
END

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'Accounting')
BEGIN
    EXEC('CREATE SCHEMA Accounting');
    PRINT '  Created schema: Accounting';
END

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'User')
BEGIN
    EXEC('CREATE SCHEMA [User]');
    PRINT '  Created schema: User';
END

PRINT '';

-- ========================================
-- Step 2: Creating tables...
-- ========================================
PRINT 'Step 2: Creating tables...';
-- (Your table creation scripts go here)
PRINT '  Created tables...';
PRINT '';

-- ========================================
-- Step 3: Migrating data in correct order
-- ========================================
PRINT 'Step 3: Migrating data...';
PRINT '';

-- ========================================
-- Phase 1: Independent lookup/reference tables (no foreign keys)
-- ========================================
PRINT 'Phase 1: Migrating independent lookup tables...';

-- User.RoleType (no dependencies)
PRINT '  Migrating User.RoleType...';
-- INSERT INTO [User].RoleType ... (your data)
PRINT '    Migrated User.RoleType';

-- Organization.EntityType (no dependencies)
PRINT '  Migrating Organization.EntityType...';
-- INSERT INTO Organization.EntityType ... (your data)
PRINT '    Migrated Organization.EntityType';

-- Organization.State (no dependencies)
PRINT '  Migrating Organization.State...';
-- INSERT INTO Organization.State ... (your data)
PRINT '    Migrated Organization.State';

-- Property lookup tables (no dependencies)
PRINT '  Migrating Property lookup tables...';
-- INSERT INTO Property.PropertyType ...
-- INSERT INTO Property.PropertyStatus ...
-- INSERT INTO Property.PropertyStyle ...
-- INSERT INTO Property.ReservationType ...
-- INSERT INTO Property.ReservationStatus ...
-- INSERT INTO Property.ReservationNotice ...
-- INSERT INTO Property.DocumentType ...
-- INSERT INTO Property.BedSize ...
-- INSERT INTO Property.BillingType ...
-- INSERT INTO Property.DepositType ...
-- INSERT INTO Property.CheckInTime ...
-- INSERT INTO Property.CheckOutTime ...
-- INSERT INTO Property.Frequency ...
-- INSERT INTO Property.TrashDays ...
PRINT '    Migrated Property lookup tables';

-- Accounting lookup tables (no dependencies)
PRINT '  Migrating Accounting lookup tables...';
-- INSERT INTO Accounting.AccountType ...
-- INSERT INTO Accounting.TransactionType ...
PRINT '    Migrated Accounting lookup tables';

PRINT '';

-- ========================================
-- Phase 2: Organization.Organization (foundation for everything)
-- ========================================
PRINT 'Phase 2: Migrating Organization.Organization...';
-- INSERT INTO Organization.Organization ... (your data)
PRINT '  Migrated Organization.Organization';
PRINT '';

-- ========================================
-- Phase 3: Organization.Office (depends on Organization, has identity column)
-- ========================================
PRINT 'Phase 3: Migrating Organization.Office...';
SET IDENTITY_INSERT Organization.Office ON;
-- INSERT INTO Organization.Office (OfficeId, OrganizationId, ...) VALUES ...
SET IDENTITY_INSERT Organization.Office OFF;
PRINT '  Migrated Organization.Office';
PRINT '';

-- ========================================
-- Phase 4: Organization.CodeSequence (depends on Organization)
-- ========================================
PRINT 'Phase 4: Migrating Organization.CodeSequence...';
-- INSERT INTO Organization.CodeSequence ... (your data)
PRINT '  Migrated Organization.CodeSequence';
PRINT '';

-- ========================================
-- Phase 5: User.User (depends on Organization)
-- ========================================
PRINT 'Phase 5: Migrating User.User...';
-- INSERT INTO [User].[User] (UserId, OrganizationId, ...) VALUES ...
PRINT '  Migrated User.User';
PRINT '';

-- ========================================
-- Phase 6: Organization tables that depend on Office (with identity columns)
-- ========================================
PRINT 'Phase 6: Migrating Organization tables with identity columns...';

-- Organization.Area
PRINT '  Migrating Organization.Area...';
SET IDENTITY_INSERT Organization.Area ON;
-- INSERT INTO Organization.Area (AreaId, OfficeId, ...) VALUES ...
SET IDENTITY_INSERT Organization.Area OFF;

-- Organization.Region
PRINT '  Migrating Organization.Region...';
SET IDENTITY_INSERT Organization.Region ON;
-- INSERT INTO Organization.Region (RegionId, OfficeId, ...) VALUES ...
SET IDENTITY_INSERT Organization.Region OFF;

-- Organization.Building
PRINT '  Migrating Organization.Building...';
SET IDENTITY_INSERT Organization.Building ON;
-- INSERT INTO Organization.Building (BuildingId, OfficeId, ...) VALUES ...
SET IDENTITY_INSERT Organization.Building OFF;

-- Organization.Color
PRINT '  Migrating Organization.Color...';
SET IDENTITY_INSERT Organization.Color ON;
-- INSERT INTO Organization.Color (ColorId, OfficeId, ...) VALUES ...
SET IDENTITY_INSERT Organization.Color OFF;

PRINT '';

-- ========================================
-- Phase 7: Organization tables that depend on Office (no identity columns)
-- ========================================
PRINT 'Phase 7: Migrating Organization tables dependent on Office...';

-- Organization.Agent
PRINT '  Migrating Organization.Agent...';
-- INSERT INTO Organization.Agent (AgentId, OfficeId, ...) VALUES ...
PRINT '    Migrated Organization.Agent';

-- Organization.Contact
PRINT '  Migrating Organization.Contact...';
-- INSERT INTO Organization.Contact (ContactId, OfficeId, ...) VALUES ...
PRINT '    Migrated Organization.Contact';

-- Organization.Company
PRINT '  Migrating Organization.Company...';
-- INSERT INTO Organization.Company (CompanyId, OfficeId, ...) VALUES ...
PRINT '    Migrated Organization.Company';

-- Organization.Vendor
PRINT '  Migrating Organization.Vendor...';
-- INSERT INTO Organization.Vendor (VendorId, OfficeId, ...) VALUES ...
PRINT '    Migrated Organization.Vendor';

PRINT '';

-- ========================================
-- Phase 8: Property tables (depend on Contact, Office, etc.)
-- ========================================
PRINT 'Phase 8: Migrating Property tables...';

-- Property.Property (depends on Contact for Owner1, Office, etc.)
PRINT '  Migrating Property.Property...';
-- INSERT INTO Property.Property (PropertyId, Owner1Id, OfficeId, ...) VALUES ...
PRINT '    Migrated Property.Property';

-- Property.PropertyInformation (depends on Property)
PRINT '  Migrating Property.PropertyInformation...';
-- INSERT INTO Property.PropertyInformation (PropertyInformationId, PropertyId, ...) VALUES ...
PRINT '    Migrated Property.PropertyInformation';

-- Property.PropertyHtml (depends on Property)
PRINT '  Migrating Property.PropertyHtml...';
-- INSERT INTO Property.PropertyHtml (PropertyHtmlId, PropertyId, ...) VALUES ...
PRINT '    Migrated Property.PropertyHtml';

-- Property.Reservation (depends on Property, Contact, Office, etc.)
PRINT '  Migrating Property.Reservation...';
-- INSERT INTO Property.Reservation (ReservationId, PropertyId, ContactId, OfficeId, ...) VALUES ...
PRINT '    Migrated Property.Reservation';

-- Property.LeaseInformation (depends on Property)
PRINT '  Migrating Property.LeaseInformation...';
-- INSERT INTO Property.LeaseInformation (LeaseInformationId, PropertyId, ...) VALUES ...
PRINT '    Migrated Property.LeaseInformation';

-- Property.Document (depends on Office)
PRINT '  Migrating Property.Document...';
-- INSERT INTO Property.Document (DocumentId, OfficeId, ...) VALUES ...
PRINT '    Migrated Property.Document';

PRINT '';

-- ========================================
-- Phase 9: User tables that depend on User
-- ========================================
PRINT 'Phase 9: Migrating User-dependent tables...';

-- User.RefreshToken (depends on User)
PRINT '  Migrating User.RefreshToken...';
-- INSERT INTO [User].RefreshToken (RefreshTokenId, UserId, ...) VALUES ...
PRINT '    Migrated User.RefreshToken';

-- Property.PropertySelection (depends on User)
PRINT '  Migrating Property.PropertySelection...';
-- INSERT INTO Property.PropertySelection (PropertySelectionId, UserId, ...) VALUES ...
PRINT '    Migrated Property.PropertySelection';

PRINT '';

-- ========================================
-- Phase 10: Accounting tables
-- ========================================
PRINT 'Phase 10: Migrating Accounting tables...';

-- Accounting.ChartOfAccounts (has identity column)
PRINT '  Migrating Accounting.ChartOfAccounts...';
SET IDENTITY_INSERT Accounting.ChartOfAccounts ON;
-- INSERT INTO Accounting.ChartOfAccounts (ChartOfAccountsId, ...) VALUES ...
SET IDENTITY_INSERT Accounting.ChartOfAccounts OFF;
PRINT '    Migrated Accounting.ChartOfAccounts';

-- Accounting.Invoice (depends on Organization, Office, Reservation)
PRINT '  Migrating Accounting.Invoice...';
-- INSERT INTO Accounting.Invoice (InvoiceId, OrganizationId, OfficeId, ReservationId, ...) VALUES ...
PRINT '    Migrated Accounting.Invoice';

-- Accounting.LedgerLine (depends on Invoice)
PRINT '  Migrating Accounting.LedgerLine...';
-- INSERT INTO Accounting.LedgerLine (LedgerLineId, InvoiceId, ...) VALUES ...
PRINT '    Migrated Accounting.LedgerLine';

-- Accounting.InvoiceLedgerLine (junction table)
PRINT '  Migrating Accounting.InvoiceLedgerLine...';
-- INSERT INTO Accounting.InvoiceLedgerLine (InvoiceId, LedgerLineId, ...) VALUES ...
PRINT '    Migrated Accounting.InvoiceLedgerLine';

PRINT '';

-- ========================================
-- Migration Complete
-- ========================================
PRINT '========================================';
PRINT 'Migration completed successfully!';
PRINT '========================================';
PRINT '';
PRINT 'Next steps:';
PRINT '1. Verify data migration by comparing row counts';
PRINT '2. Test application functionality';
PRINT '3. Update application connection strings if needed';
PRINT '4. Once verified, you can drop old dbo tables if desired';
PRINT '';
PRINT 'Completion time: ' + CONVERT(VARCHAR, GETDATE(), 126);
